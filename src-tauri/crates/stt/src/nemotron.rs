//! CPU streaming Nemotron ASR provider backed by sherpa-onnx.
//!
//! The model is intentionally loaded from a caller-provided directory. The
//! model archive is an optional app-store resource and must not be included in
//! the application installer.

use std::path::PathBuf;
use std::sync::Arc;

use crossbeam_channel::Receiver;
use sherpa_onnx::{OnlineRecognizer, OnlineRecognizerConfig};
use tokio::sync::mpsc;

use crate::error::SttError;
use crate::provider::SttProvider;
use crate::types::{TranscriptEvent, Word};

/// Configuration for the CPU Nemotron streaming model.
#[derive(Debug, Clone)]
pub struct NemotronConfig {
    /// Directory containing `encoder.int8.onnx`, `decoder.int8.onnx`,
    /// `joiner.int8.onnx`, and `tokens.txt`.
    pub model_dir: PathBuf,
    pub sample_rate: u32,
    pub num_threads: i32,
}

impl NemotronConfig {
    fn model_file(&self, name: &str) -> PathBuf {
        self.model_dir.join(name)
    }

    fn validate(&self) -> Result<(), SttError> {
        for name in [
            "encoder.int8.onnx",
            "decoder.int8.onnx",
            "joiner.int8.onnx",
            "tokens.txt",
        ] {
            let path = self.model_file(name);
            if !path.is_file() {
                return Err(SttError::ModelNotFound(path.display().to_string()));
            }
        }
        Ok(())
    }
}

/// sherpa-onnx online recognizer for the Nemotron 3.5 ASR Streaming 0.6B INT8
/// model.
pub struct NemotronClient {
    config: NemotronConfig,
    active: Arc<std::sync::atomic::AtomicBool>,
}

impl std::fmt::Debug for NemotronClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NemotronClient")
            .field("model_dir", &self.config.model_dir)
            .field("sample_rate", &self.config.sample_rate)
            .field("num_threads", &self.config.num_threads)
            .finish_non_exhaustive()
    }
}

impl NemotronClient {
    pub fn new(config: NemotronConfig) -> Self {
        Self {
            config,
            active: Arc::new(std::sync::atomic::AtomicBool::new(true)),
        }
    }

    fn recognizer(&self) -> Result<OnlineRecognizer, SttError> {
        self.config.validate()?;

        let mut config = OnlineRecognizerConfig::default();
        config.model_config.transducer.encoder =
            Some(self.config.model_file("encoder.int8.onnx").display().to_string());
        config.model_config.transducer.decoder =
            Some(self.config.model_file("decoder.int8.onnx").display().to_string());
        config.model_config.transducer.joiner =
            Some(self.config.model_file("joiner.int8.onnx").display().to_string());
        config.model_config.tokens =
            Some(self.config.model_file("tokens.txt").display().to_string());
        config.model_config.provider = Some("cpu".to_string());
        config.model_config.num_threads = self.config.num_threads;
        config.decoding_method = Some("greedy_search".to_string());
        config.enable_endpoint = true;

        OnlineRecognizer::create(&config)
            .ok_or_else(|| SttError::ModelNotFound("Nemotron runtime failed to initialize".into()))
    }

    fn emit_result(
        recognizer: &OnlineRecognizer,
        stream: &sherpa_onnx::OnlineStream,
        event_tx: &mpsc::Sender<TranscriptEvent>,
        is_final: bool,
    ) -> Result<(), SttError> {
        let result = recognizer
            .get_result(stream)
            .ok_or_else(|| SttError::ParseError("Nemotron result unavailable".into()))?;
        let transcript = result.text.trim().to_string();
        if transcript.is_empty() {
            return Ok(());
        }

        let event = if is_final {
            TranscriptEvent::Final {
                transcript,
                words: Vec::<Word>::new(),
                confidence: 0.0,
                speech_final: true,
            }
        } else {
            TranscriptEvent::Partial {
                transcript,
                words: Vec::<Word>::new(),
            }
        };

        event_tx
            .blocking_send(event)
            .map_err(|error| SttError::SendError(error.to_string()))?;

        if is_final && recognizer.is_endpoint(stream) {
            event_tx
                .blocking_send(TranscriptEvent::UtteranceEnd)
                .map_err(|error| SttError::SendError(error.to_string()))?;
        }

        Ok(())
    }
}

#[async_trait::async_trait]
impl SttProvider for NemotronClient {
    async fn start(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        self.active.store(true, std::sync::atomic::Ordering::SeqCst);
        let active = self.active.clone();
        let config = self.config.clone();

        let result = tokio::task::spawn_blocking(move || {
            let sample_rate = i32::try_from(config.sample_rate)
                .map_err(|_| SttError::ModelNotFound("invalid Nemotron sample rate".into()))?;
            let client = NemotronClient::new(config);
            let recognizer = client.recognizer()?;
            let stream = recognizer.create_stream();

            event_tx
                .blocking_send(TranscriptEvent::Connected)
                .map_err(|error| SttError::SendError(error.to_string()))?;

            while active.load(std::sync::atomic::Ordering::SeqCst) {
                let samples = match audio_rx.recv() {
                    Ok(samples) => samples,
                    Err(_) => break,
                };
                if samples.is_empty() {
                    continue;
                }

                let samples = samples
                    .into_iter()
                    .map(|sample| f32::from(sample) / f32::from(i16::MAX))
                    .collect::<Vec<_>>();
                stream.accept_waveform(sample_rate, &samples);

                while recognizer.is_ready(&stream) {
                    recognizer.decode(&stream);
                }

                Self::emit_result(&recognizer, &stream, &event_tx, false)?;

                if recognizer.is_endpoint(&stream) {
                    Self::emit_result(&recognizer, &stream, &event_tx, true)?;
                    recognizer.reset(&stream);
                }
            }

            stream.input_finished();
            while recognizer.is_ready(&stream) {
                recognizer.decode(&stream);
            }
            Self::emit_result(&recognizer, &stream, &event_tx, true)?;
            event_tx
                .blocking_send(TranscriptEvent::Disconnected)
                .map_err(|error| SttError::SendError(error.to_string()))?;
            Ok::<(), SttError>(())
        })
        .await
        .map_err(|error| SttError::ConnectionFailed(format!("Nemotron worker failed: {error}")))?;

        result
    }

    fn stop(&self) {
        self.active
            .store(false, std::sync::atomic::Ordering::SeqCst);
    }

    fn name(&self) -> &'static str {
        "Nemotron"
    }
}
