//! Local streaming STT via sherpa-onnx (Moonshine) using the `sherpa-rs` crate.
//!
//! Speech is segmented with the app's energy VAD and each utterance is
//! transcribed with Moonshine. Moonshine has **no fixed 30-second window** —
//! inference cost is proportional to the real audio length — and runs
//! ~10x faster than real time on CPU, so the
//! inference queue never backs up on low-end hardware. Emits the same
//! [`TranscriptEvent`] types as the other providers.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crossbeam_channel::Receiver;
use tokio::sync::mpsc;

use crate::error::SttError;
use crate::provider::SttProvider;
use crate::types::TranscriptEvent;

/// Maximum audio buffer before force-flushing to inference (20 seconds at
/// 16 kHz). Moonshine handles long clips natively, so this is a generous
/// backstop rather than a hard architectural limit like a fixed 30 s window.
const MAX_BUFFER_SAMPLES: usize = 16_000 * 20;

/// Minimum audio buffer for inference (0.5 seconds). Moonshine has no
/// "input too short" floor, so this is just noise-gating tiny blips.
const MIN_BUFFER_SAMPLES: usize = 16_000 / 2;

/// Default total silence (ms) tolerated before an utterance is finalized, used
/// when the caller doesn't specify a pause window. Matches the "1.4 s" middle of
/// the Settings "Pause Sensitivity" slider.
const DEFAULT_PAUSE_SILENCE_MS: u32 = 1_400;

/// The pause window is split into two VAD phases: silence up to this point marks
/// a *pause* (entering the hangover); the remainder is the resume-grace window in
/// which speech may resume and continue the same utterance. Kept at a fixed
/// ~0.7 s so short windows stay responsive while extra tolerance flows into the
/// grace phase.
const PAUSE_END_SILENCE_CAP_MS: u32 = 700;

/// Standard int8 file names inside a `sherpa-onnx-moonshine-*-en-int8` model
/// directory.
const PREPROCESS: &str = "preprocess.onnx";
const ENCODE: &str = "encode.int8.onnx";
const UNCACHED_DECODE: &str = "uncached_decode.int8.onnx";
const CACHED_DECODE: &str = "cached_decode.int8.onnx";
const TOKENS: &str = "tokens.txt";

/// Convert i16 PCM samples to f32 in [-1.0, 1.0] range.
fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| f32::from(s) / 32768.0).collect()
}

/// Local Moonshine (sherpa-onnx) STT provider.
pub struct SherpaProvider {
    model_dir: PathBuf,
    n_threads: i32,
    /// Total silence (ms) tolerated before an utterance is finalized (the
    /// user-facing "Pause Sensitivity"). Split into VAD end-silence + resume
    /// grace in [`SherpaProvider::start`].
    pause_silence_ms: u32,
    cancelled: Arc<AtomicBool>,
}

impl SherpaProvider {
    /// Create a new Moonshine provider.
    ///
    /// - `model_dir`: directory containing the Moonshine int8 ONNX files
    ///   (`preprocess.onnx`, `encode.int8.onnx`, `uncached_decode.int8.onnx`,
    ///   `cached_decode.int8.onnx`, `tokens.txt`)
    /// - `n_threads`: number of CPU threads for inference
    /// - `pause_silence_ms`: total silence tolerated before finalizing an
    ///   utterance. `None` uses [`DEFAULT_PAUSE_SILENCE_MS`]. Clamped to a sane
    ///   range so a stray value can't disable endpointing or make it hair-trigger.
    pub fn new(model_dir: PathBuf, n_threads: i32, pause_silence_ms: Option<u32>) -> Self {
        Self {
            model_dir,
            n_threads: n_threads.max(1),
            pause_silence_ms: pause_silence_ms
                .unwrap_or(DEFAULT_PAUSE_SILENCE_MS)
                .clamp(300, 5_000),
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Absolute path of a file inside the model directory, as a `String`
    /// (sherpa-rs takes owned `String` paths).
    fn file(&self, name: &str) -> String {
        self.model_dir.join(name).to_string_lossy().into_owned()
    }
}

impl std::fmt::Debug for SherpaProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SherpaProvider")
            .field("model_dir", &self.model_dir)
            .field("n_threads", &self.n_threads)
            .finish_non_exhaustive()
    }
}

#[async_trait::async_trait]
impl SttProvider for SherpaProvider {
    #[expect(clippy::too_many_lines, reason = "spawns two blocking tasks with setup; splitting would obscure the pipeline flow")]
    async fn start(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        // Re-arm the cancel flag: the supervisor stops this provider to fail back
        // to the cloud engine, then reuses the same instance on the next failover.
        self.cancelled.store(false, Ordering::SeqCst);

        // All five model files must be present before we announce Connected.
        for name in [PREPROCESS, ENCODE, UNCACHED_DECODE, CACHED_DECODE, TOKENS] {
            let path = self.model_dir.join(name);
            if !path.exists() {
                return Err(SttError::ModelNotFound(format!(
                    "Moonshine model file not found: {}",
                    path.display()
                )));
            }
        }

        let _ = event_tx.send(TranscriptEvent::Connected).await;

        let preprocessor = self.file(PREPROCESS);
        let encoder = self.file(ENCODE);
        let uncached_decoder = self.file(UNCACHED_DECODE);
        let cached_decoder = self.file(CACHED_DECODE);
        let tokens = self.file(TOKENS);
        let n_threads = self.n_threads;
        let cancelled = self.cancelled.clone();

        let (inference_tx, mut inference_rx) = mpsc::channel::<Vec<i16>>(8);

        // ── Task 1: VAD + audio accumulation ─────────────────────────────
        // Energy-VAD front-end. All thresholds are in real milliseconds
        // (derived from each frame's sample count), so behaviour is independent
        // of the OS audio buffer size — WASAPI shared-mode frame sizes vary by
        // device/driver, and the old frame-count thresholds made the effective
        // silence window unpredictable.
        let vad_cancelled = cancelled.clone();
        let vad_event_tx = event_tx.clone();
        let pause_silence_ms = self.pause_silence_ms;
        let vad_handle = tokio::task::spawn_blocking(move || {
            use lumenlive_audio::{AudioFrame, Vad, VadConfig, VadTransition};

            // Split the user's total pause window into the two VAD phases.
            // Deliberate scripture-reading pauses at commas/semicolons run
            // 300-500 ms, and a reader drawing breath between clauses can pause
            // longer. `end_silence_ms` marks the pause; the utterance then stays
            // open through `resume_grace_ms` so speech resuming within the total
            // window continues the SAME utterance instead of chopping a verse
            // into fragments (which starves Moonshine of sentence context). Only
            // a full `pause_silence_ms` of silence finalizes. Moonshine has no
            // 30s pad, so longer utterances are cheap.
            let end_silence_ms = pause_silence_ms.min(PAUSE_END_SILENCE_CAP_MS);
            let resume_grace_ms = pause_silence_ms.saturating_sub(end_silence_ms);

            let vad_config = VadConfig {
                silence_threshold: 0.005,
                frame_threshold: 0.0025,
                sample_rate: 16_000,
                min_voice_ms: 40, // ~40 ms of voice to start
                end_silence_ms,
                resume_grace_ms,
                // Backstop just under MAX_BUFFER_SAMPLES (20 s) so the VAD, not
                // the provider's hard buffer cap, is what closes a runaway
                // utterance from a speaker who never pauses.
                max_utterance_ms: 19_000,
                pre_buffer_ms: 250,
                ..VadConfig::default()
            };
            let mut vad = Vad::new(vad_config);
            let mut audio_buffer: Vec<i16> = Vec::new();
            let mut dropped_utterances: u64 = 0;

            loop {
                if vad_cancelled.load(Ordering::SeqCst) {
                    if audio_buffer.len() >= MIN_BUFFER_SAMPLES {
                        let _ = inference_tx.blocking_send(std::mem::take(&mut audio_buffer));
                    }
                    break;
                }

                match audio_rx.recv_timeout(Duration::from_millis(50)) {
                    Ok(samples) => {
                        let frame = AudioFrame { samples, timestamp_ms: 0 };
                        let result = vad.process(&frame);

                        if let Some(transition) = result.transition {
                            match transition {
                                VadTransition::SpeechStarted => {
                                    let _ = vad_event_tx
                                        .blocking_send(TranscriptEvent::SpeechStarted);
                                }
                                VadTransition::SpeechEnded => {
                                    if audio_buffer.len() >= MIN_BUFFER_SAMPLES {
                                        // Non-blocking: drop (and count) the
                                        // utterance if inference is somehow
                                        // saturated, instead of stalling the VAD
                                        // task. With Moonshine at RTF ~0.1 this
                                        // should effectively never fire.
                                        match inference_tx
                                            .try_send(std::mem::take(&mut audio_buffer))
                                        {
                                            Ok(()) => {}
                                            Err(mpsc::error::TrySendError::Full(chunk)) => {
                                                dropped_utterances += 1;
                                                log::warn!(
                                                    "[SHERPA] inference queue full — DROPPED utterance ({} samples / {:.1}s), dropped_total={dropped_utterances}",
                                                    chunk.len(),
                                                    chunk.len() as f64 / 16_000.0,
                                                );
                                            }
                                            Err(mpsc::error::TrySendError::Closed(_)) => break,
                                        }
                                    }
                                    // else: sub-0.5s speech stays buffered to
                                    // merge with the next burst rather than
                                    // being flushed as a fragment.
                                }
                            }
                        }

                        for frame in result.frames {
                            audio_buffer.extend_from_slice(&frame.samples);
                        }

                        if audio_buffer.len() >= MAX_BUFFER_SAMPLES {
                            log::warn!(
                                "[SHERPA] flush on MAX_BUFFER ({} samples / {:.1}s) — VAD never closed",
                                audio_buffer.len(),
                                audio_buffer.len() as f64 / 16_000.0,
                            );
                            match inference_tx.try_send(std::mem::take(&mut audio_buffer)) {
                                Ok(()) => {}
                                Err(mpsc::error::TrySendError::Full(chunk)) => {
                                    dropped_utterances += 1;
                                    log::warn!(
                                        "[SHERPA] inference queue full — DROPPED max-buffer chunk ({} samples / {:.1}s), dropped_total={dropped_utterances}",
                                        chunk.len(),
                                        chunk.len() as f64 / 16_000.0,
                                    );
                                }
                                Err(mpsc::error::TrySendError::Closed(_)) => break,
                            }
                        }
                    }
                    Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
                    Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                        if audio_buffer.len() >= MIN_BUFFER_SAMPLES {
                            let _ = inference_tx.blocking_send(std::mem::take(&mut audio_buffer));
                        }
                        break;
                    }
                }
            }
        });

        // ── Task 2: Moonshine inference ──────────────────────────────────
        let inf_cancelled = cancelled.clone();
        let inf_event_tx = event_tx.clone();
        let inf_handle = tokio::task::spawn_blocking(move || {
            let config = sherpa_rs::moonshine::MoonshineConfig {
                preprocessor,
                encoder,
                uncached_decoder,
                cached_decoder,
                tokens,
                provider: Some("cpu".into()),
                num_threads: Some(n_threads),
                ..Default::default()
            };

            let mut recognizer = match sherpa_rs::moonshine::MoonshineRecognizer::new(config) {
                Ok(r) => r,
                Err(e) => {
                    log::error!("[Sherpa] Failed to load Moonshine model: {e}");
                    let _ = inf_event_tx.blocking_send(TranscriptEvent::Error(format!(
                        "Failed to load Moonshine model: {e}"
                    )));
                    return;
                }
            };

            log::info!("[Sherpa] Moonshine model loaded, ready for inference");

            while let Some(audio_i16) = inference_rx.blocking_recv() {
                if inf_cancelled.load(Ordering::SeqCst) {
                    break;
                }

                let audio_f32 = i16_to_f32(&audio_i16);
                #[expect(clippy::cast_precision_loss, reason = "audio sample count fits in f64")]
                let audio_duration_s = audio_i16.len() as f64 / 16_000.0;

                let start = std::time::Instant::now();
                let result = recognizer.transcribe(16_000, &audio_f32);
                let elapsed = start.elapsed();

                let text = result.text.trim().to_string();
                let rtf = elapsed.as_secs_f64() / audio_duration_s.max(0.001);
                log::info!(
                    "[Sherpa] Transcribed {audio_duration_s:.1}s audio in {elapsed:.2?} (RTF={rtf:.2}): \"{text}\""
                );

                if !text.is_empty() {
                    let _ = inf_event_tx.blocking_send(TranscriptEvent::Final {
                        transcript: text,
                        words: Vec::new(),
                        confidence: 0.9,
                        speech_final: true,
                    });
                }

                let _ = inf_event_tx.blocking_send(TranscriptEvent::UtteranceEnd);
            }

            log::info!("[Sherpa] Inference task exiting");
        });

        let _ = tokio::join!(vad_handle, inf_handle);
        let _ = event_tx.send(TranscriptEvent::Disconnected).await;

        Ok(())
    }

    fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn name(&self) -> &'static str {
        "sherpa"
    }
}
