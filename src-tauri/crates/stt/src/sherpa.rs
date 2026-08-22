//! Local STT via sherpa-onnx using the `sherpa-rs` crate.
//!
//! Speech is segmented with the app's energy VAD and each closed utterance is
//! transcribed by an offline recognizer. Two recognizers share the exact same
//! VAD front-end, partial/finalization logic, and failover wiring — they differ
//! only in the model that turns audio into text:
//!
//! - [`SherpaProvider`] — **Moonshine**. Compact, ~10x faster than real time on
//!   CPU, no fixed 30 s window; the low-footprint default offline engine.
//! - [`TransducerProvider`] — an offline **Zipformer transducer** with
//!   contextual **hotword biasing** built from the app's Bible keyterms
//!   (book names, reference cues, numerals). More accurate on scripture proper
//!   nouns at a modest cost, still comfortably real time on VAD-segmented
//!   utterances.
//!
//! Both emit the same [`TranscriptEvent`] types, so the detection pipeline and
//! the cloud↔on-device supervisor treat them identically. The shared engine
//! lives in [`run_engine`]; each provider only supplies a recognizer factory.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

/// A unit of work for the inference task. Partials are mid-utterance previews
/// (re-transcriptions of the growing buffer); a Final is the authoritative
/// whole-utterance transcription emitted when the VAD closes the utterance.
enum InferenceJob {
    /// Mid-utterance preview: a clone of the buffer-so-far. Display-only — it
    /// never becomes a segment or feeds the final transcript.
    Partial(Vec<i16>),
    /// Closed utterance: the taken buffer. Emits `Final` + `UtteranceEnd`.
    Final(Vec<i16>),
}

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

/// New speech (samples) that must accumulate since the last mid-utterance
/// partial before the next one fires — ~1.2 s at 16 kHz. Frequent enough that a
/// slowly-read verse shows interim words while it's still being spoken, sparse
/// enough that repeated re-transcription of the growing buffer stays far under
/// real time even on a weak CPU (Moonshine RTF ~0.1). Only consulted when
/// partials are enabled.
const PARTIAL_INTERVAL_SAMPLES: usize = 19_200;

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

/// The five int8 files a `sherpa-onnx-moonshine-*-en-int8` directory must
/// contain for [`SherpaProvider`] to load.
pub const MOONSHINE_MODEL_FILES: [&str; 5] =
    [PREPROCESS, ENCODE, UNCACHED_DECODE, CACHED_DECODE, TOKENS];

/// Canonical int8 file names inside a Zipformer transducer model directory. The
/// `download:zipformer` script renames whatever the source repo ships to exactly
/// these names so the provider's paths are model-repo-independent.
const T_ENCODER: &str = "encoder.int8.onnx";
const T_DECODER: &str = "decoder.int8.onnx";
const T_JOINER: &str = "joiner.int8.onnx";

/// Byte-pair vocab used to tokenize word-level hotwords into the model's token
/// space. **Optional** — present in a directory unlocks contextual biasing; its
/// absence simply decodes without hotwords (the engine still runs).
const T_BPE_VOCAB: &str = "bpe.vocab";

/// The four files a Zipformer transducer directory must contain for
/// [`TransducerProvider`] to load (`tokens.txt` is shared with Moonshine).
/// `bpe.vocab` is intentionally excluded — it's optional (biasing on/off), not
/// required for the recognizer to run.
pub const TRANSDUCER_MODEL_FILES: [&str; 4] = [T_ENCODER, T_DECODER, T_JOINER, TOKENS];

/// Path of the first required Moonshine model file missing from `model_dir`, or
/// `None` when all five are present.
///
/// Single-sources the readiness definition so the app's provider builder and
/// `SherpaProvider::start`'s own gate agree on exactly what "the model is
/// installed" means: a directory that merely *exists* but is missing a file is
/// **not** ready. Callers use it to fail fast with an actionable message (and to
/// treat the offline fallback as unavailable) instead of surfacing a raw error
/// deeper in the pipeline.
pub fn missing_moonshine_file(model_dir: &Path) -> Option<PathBuf> {
    MOONSHINE_MODEL_FILES
        .iter()
        .map(|name| model_dir.join(name))
        .find(|path| !path.exists())
}

/// Path of the first required Zipformer transducer file missing from
/// `model_dir`, or `None` when all required files are present. The transducer
/// analogue of [`missing_moonshine_file`] — same fail-fast contract, shared by
/// the provider builder and [`TransducerProvider::start`]. `bpe.vocab` is not
/// checked here: it's optional (its presence toggles hotword biasing).
pub fn missing_transducer_file(model_dir: &Path) -> Option<PathBuf> {
    TRANSDUCER_MODEL_FILES
        .iter()
        .map(|name| model_dir.join(name))
        .find(|path| !path.exists())
}

/// Convert i16 PCM samples to f32 in [-1.0, 1.0] range.
fn i16_to_f32(samples: &[i16]) -> Vec<f32> {
    samples.iter().map(|&s| f32::from(s) / 32768.0).collect()
}

/// A whole-utterance recognizer: 16 kHz mono f32 in, trimmed transcript out.
///
/// Both Moonshine and the offline Zipformer transducer implement this so the
/// shared VAD + inference runner ([`run_engine`]) stays recognizer-agnostic —
/// the only per-engine code is constructing the recognizer and one `transcribe`
/// call. The returned text is already trimmed.
trait UtteranceRecognizer: Send {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> String;
}

/// Moonshine adapter — unwraps sherpa-rs's `{ text }` result and trims it.
struct MoonshineRec(sherpa_rs::moonshine::MoonshineRecognizer);

impl UtteranceRecognizer for MoonshineRec {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> String {
        self.0.transcribe(sample_rate, samples).text.trim().to_string()
    }
}

/// Offline Zipformer transducer adapter — sherpa-rs returns the text directly.
struct TransducerRec(sherpa_rs::transducer::TransducerRecognizer);

impl UtteranceRecognizer for TransducerRec {
    fn transcribe(&mut self, sample_rate: u32, samples: &[f32]) -> String {
        self.0.transcribe(sample_rate, samples).trim().to_string()
    }
}

/// Run the shared VAD + inference engine to completion.
///
/// Owns the whole pipeline both offline providers share: announce `Connected`,
/// spawn the energy-VAD accumulation task (which segments utterances and queues
/// [`InferenceJob`]s) and the inference task (which loads the recognizer via
/// `build_recognizer` and transcribes each job), join them, then announce
/// `Disconnected`. The only per-engine input is `build_recognizer` (a factory
/// run once on the inference thread) and `label` (for logs). Callers verify
/// their model files and re-arm `cancelled` *before* calling.
#[expect(
    clippy::too_many_lines,
    reason = "one cohesive VAD→inference pipeline (segmentation, throttled partials, \
              finalization); splitting the two blocking tasks apart would obscure the \
              backpressure/hand-off invariants they exist to express"
)]
async fn run_engine<F>(
    pause_silence_ms: u32,
    partials_enabled: bool,
    cancelled: Arc<AtomicBool>,
    label: &'static str,
    audio_rx: Receiver<Vec<i16>>,
    event_tx: mpsc::Sender<TranscriptEvent>,
    build_recognizer: F,
) -> Result<(), SttError>
where
    F: FnOnce() -> Result<Box<dyn UtteranceRecognizer>, String> + Send + 'static,
{
    let _ = event_tx.send(TranscriptEvent::Connected).await;

    let (inference_tx, mut inference_rx) = mpsc::channel::<InferenceJob>(8);

    // Bounds outstanding partials to at most one: the VAD only queues a new
    // partial when the previous one has been consumed. This keeps a closing
    // `Final` from ever waiting behind a backlog of stale previews — the
    // whole point of partials is lower latency, not more of it.
    let partial_inflight = Arc::new(AtomicBool::new(false));

    // ── Task 1: VAD + audio accumulation ─────────────────────────────
    // Energy-VAD front-end. All thresholds are in real milliseconds
    // (derived from each frame's sample count), so behaviour is independent
    // of the OS audio buffer size — WASAPI shared-mode frame sizes vary by
    // device/driver, and the old frame-count thresholds made the effective
    // silence window unpredictable.
    let vad_cancelled = cancelled.clone();
    let vad_event_tx = event_tx.clone();
    let vad_partial_inflight = partial_inflight.clone();
    let vad_handle = tokio::task::spawn_blocking(move || {
        use lumenlive_audio::{AudioFrame, Vad, VadConfig, VadTransition};

        // Split the user's total pause window into the two VAD phases.
        // Deliberate scripture-reading pauses at commas/semicolons run
        // 300-500 ms, and a reader drawing breath between clauses can pause
        // longer. `end_silence_ms` marks the pause; the utterance then stays
        // open through `resume_grace_ms` so speech resuming within the total
        // window continues the SAME utterance instead of chopping a verse
        // into fragments (which starves the recognizer of sentence context).
        // Only a full `pause_silence_ms` of silence finalizes. Offline
        // recognizers have no 30s pad, so longer utterances are cheap.
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
        // Mid-utterance partial bookkeeping: whether we're inside a speech
        // segment, and the buffer length at the last partial emit (so the
        // next one fires only after PARTIAL_INTERVAL_SAMPLES of new audio).
        let mut in_speech = false;
        let mut last_partial_len: usize = 0;

        loop {
            if vad_cancelled.load(Ordering::SeqCst) {
                if audio_buffer.len() >= MIN_BUFFER_SAMPLES {
                    let _ = inference_tx
                        .blocking_send(InferenceJob::Final(std::mem::take(&mut audio_buffer)));
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
                                in_speech = true;
                                last_partial_len = 0;
                                let _ = vad_event_tx
                                    .blocking_send(TranscriptEvent::SpeechStarted);
                            }
                            VadTransition::SpeechEnded => {
                                in_speech = false;
                                last_partial_len = 0;
                                if audio_buffer.len() >= MIN_BUFFER_SAMPLES {
                                    // Non-blocking: drop (and count) the
                                    // utterance if inference is somehow
                                    // saturated, instead of stalling the VAD
                                    // task. At RTF well under 1 this should
                                    // effectively never fire.
                                    match inference_tx.try_send(InferenceJob::Final(
                                        std::mem::take(&mut audio_buffer),
                                    )) {
                                        Err(mpsc::error::TrySendError::Full(
                                            InferenceJob::Final(chunk),
                                        )) => {
                                            dropped_utterances += 1;
                                            log::warn!(
                                                "[SHERPA] inference queue full — DROPPED utterance ({} samples / {:.1}s), dropped_total={dropped_utterances}",
                                                chunk.len(),
                                                chunk.len() as f64 / 16_000.0,
                                            );
                                        }
                                        Ok(())
                                        | Err(mpsc::error::TrySendError::Full(_)) => {}
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

                    // Mid-utterance partial: while speech is ongoing and
                    // enough new audio has accrued, re-transcribe the buffer
                    // so far. Bounded to one in-flight partial (see
                    // `partial_inflight`) so a closing Final never queues
                    // behind a backlog. A clone (not a take) — the buffer
                    // keeps growing toward the authoritative Final.
                    if partials_enabled
                        && in_speech
                        && audio_buffer.len() >= MIN_BUFFER_SAMPLES
                        && audio_buffer.len() - last_partial_len >= PARTIAL_INTERVAL_SAMPLES
                        && !vad_partial_inflight.swap(true, Ordering::SeqCst)
                    {
                        match inference_tx.try_send(InferenceJob::Partial(audio_buffer.clone()))
                        {
                            Ok(()) => {
                                last_partial_len = audio_buffer.len();
                            }
                            // Couldn't queue — release the guard so the next
                            // interval can retry; don't advance last_partial_len.
                            Err(mpsc::error::TrySendError::Full(_)) => {
                                vad_partial_inflight.store(false, Ordering::SeqCst);
                            }
                            Err(mpsc::error::TrySendError::Closed(_)) => break,
                        }
                    }

                    if audio_buffer.len() >= MAX_BUFFER_SAMPLES {
                        log::warn!(
                            "[SHERPA] flush on MAX_BUFFER ({} samples / {:.1}s) — VAD never closed",
                            audio_buffer.len(),
                            audio_buffer.len() as f64 / 16_000.0,
                        );
                        last_partial_len = 0;
                        match inference_tx
                            .try_send(InferenceJob::Final(std::mem::take(&mut audio_buffer)))
                        {
                            Err(mpsc::error::TrySendError::Full(InferenceJob::Final(
                                chunk,
                            ))) => {
                                dropped_utterances += 1;
                                log::warn!(
                                    "[SHERPA] inference queue full — DROPPED max-buffer chunk ({} samples / {:.1}s), dropped_total={dropped_utterances}",
                                    chunk.len(),
                                    chunk.len() as f64 / 16_000.0,
                                );
                            }
                            Ok(()) | Err(mpsc::error::TrySendError::Full(_)) => {}
                            Err(mpsc::error::TrySendError::Closed(_)) => break,
                        }
                    }
                }
                Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
                Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                    if audio_buffer.len() >= MIN_BUFFER_SAMPLES {
                        let _ = inference_tx
                            .blocking_send(InferenceJob::Final(std::mem::take(&mut audio_buffer)));
                    }
                    break;
                }
            }
        }
    });

    // ── Task 2: inference ────────────────────────────────────────────
    let inf_cancelled = cancelled.clone();
    let inf_event_tx = event_tx.clone();
    let inf_partial_inflight = partial_inflight.clone();
    let inf_handle = tokio::task::spawn_blocking(move || {
        let mut recognizer = match build_recognizer() {
            Ok(r) => r,
            Err(e) => {
                log::error!("[Sherpa] {label} recognizer unavailable: {e}");
                let _ = inf_event_tx.blocking_send(TranscriptEvent::Error(e));
                return;
            }
        };

        log::info!("[Sherpa] {label} model loaded, ready for inference");

        while let Some(job) = inference_rx.blocking_recv() {
            // A Partial must release the in-flight guard even on an early
            // exit, so the VAD can queue the next preview. Do it up front for
            // the partial case regardless of what follows.
            let is_partial = matches!(job, InferenceJob::Partial(_));
            if inf_cancelled.load(Ordering::SeqCst) {
                if is_partial {
                    inf_partial_inflight.store(false, Ordering::SeqCst);
                }
                break;
            }

            let samples = match &job {
                InferenceJob::Partial(a) | InferenceJob::Final(a) => a,
            };
            let audio_f32 = i16_to_f32(samples);
            #[expect(clippy::cast_precision_loss, reason = "audio sample count fits in f64")]
            let audio_duration_s = samples.len() as f64 / 16_000.0;

            let start = std::time::Instant::now();
            let text = recognizer.transcribe(16_000, &audio_f32);
            let elapsed = start.elapsed();

            let rtf = elapsed.as_secs_f64() / audio_duration_s.max(0.001);

            match job {
                InferenceJob::Partial(_) => {
                    // Release the guard the instant this preview is done so
                    // the VAD's next interval can queue another.
                    inf_partial_inflight.store(false, Ordering::SeqCst);
                    log::info!(
                        "[SHERPA-PARTIAL] {audio_duration_s:.1}s audio in {elapsed:.2?} (RTF={rtf:.2}): \"{text}\""
                    );
                    // Display-only: emit a Partial (no UtteranceEnd, never a
                    // segment). Skip empties so a false-start doesn't blank
                    // the live line.
                    if !text.is_empty() {
                        let _ = inf_event_tx.blocking_send(TranscriptEvent::Partial {
                            transcript: text,
                            words: Vec::new(),
                        });
                    }
                }
                InferenceJob::Final(_) => {
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
            }
        }

        log::info!("[Sherpa] Inference task exiting");
    });

    let _ = tokio::join!(vad_handle, inf_handle);
    let _ = event_tx.send(TranscriptEvent::Disconnected).await;

    Ok(())
}

/// Local Moonshine (sherpa-onnx) STT provider.
pub struct SherpaProvider {
    model_dir: PathBuf,
    n_threads: i32,
    /// Total silence (ms) tolerated before an utterance is finalized (the
    /// user-facing "Pause Sensitivity"). Split into VAD end-silence + resume
    /// grace in [`SherpaProvider::start`].
    pause_silence_ms: u32,
    /// When true, emit throttled mid-utterance `Partial` events (re-transcribing
    /// the growing buffer) so interim words appear before the utterance closes.
    /// Opt-in and display-only — the `Final` is always a fresh whole-utterance
    /// transcription, so partials cannot change final accuracy.
    partials_enabled: bool,
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
    /// - `partials_enabled`: emit mid-utterance `Partial` previews (opt-in;
    ///   display-only, never affects the `Final`).
    pub fn new(
        model_dir: PathBuf,
        n_threads: i32,
        pause_silence_ms: Option<u32>,
        partials_enabled: bool,
    ) -> Self {
        Self {
            model_dir,
            n_threads: n_threads.max(1),
            pause_silence_ms: pause_silence_ms
                .unwrap_or(DEFAULT_PAUSE_SILENCE_MS)
                .clamp(300, 5_000),
            partials_enabled,
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
    async fn start(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        // Re-arm the cancel flag: the supervisor stops this provider to fail back
        // to the cloud engine, then reuses the same instance on the next failover.
        self.cancelled.store(false, Ordering::SeqCst);

        // All five model files must be present before we announce Connected.
        if let Some(missing) = missing_moonshine_file(&self.model_dir) {
            return Err(SttError::ModelNotFound(format!(
                "Moonshine model file not found: {}",
                missing.display()
            )));
        }

        // Recognizer factory — run once on the inference thread by `run_engine`.
        let preprocessor = self.file(PREPROCESS);
        let encoder = self.file(ENCODE);
        let uncached_decoder = self.file(UNCACHED_DECODE);
        let cached_decoder = self.file(CACHED_DECODE);
        let tokens = self.file(TOKENS);
        let n_threads = self.n_threads;
        let build = move || -> Result<Box<dyn UtteranceRecognizer>, String> {
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
            sherpa_rs::moonshine::MoonshineRecognizer::new(config)
                .map(|r| Box::new(MoonshineRec(r)) as Box<dyn UtteranceRecognizer>)
                .map_err(|e| format!("Failed to load Moonshine model: {e}"))
        };

        run_engine(
            self.pause_silence_ms,
            self.partials_enabled,
            self.cancelled.clone(),
            "Moonshine",
            audio_rx,
            event_tx,
            build,
        )
        .await
    }

    fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn name(&self) -> &'static str {
        "sherpa"
    }
}

/// Local offline **Zipformer transducer** STT provider, with contextual hotword
/// biasing toward the app's Bible keyterms.
///
/// Shares the entire VAD + inference engine ([`run_engine`]) with
/// [`SherpaProvider`]; the only difference is the recognizer — an offline
/// transducer decoded with `modified_beam_search` so the hotwords file (book
/// names, reference cues, numerals) actually steers the search. Hotword biasing
/// is auto-enabled when the model directory contains a `bpe.vocab` (needed to
/// tokenize word-level phrases); without it the recognizer still runs, just
/// without biasing.
pub struct TransducerProvider {
    model_dir: PathBuf,
    n_threads: i32,
    /// See [`SherpaProvider`]'s field of the same name.
    pause_silence_ms: u32,
    /// See [`SherpaProvider`]'s field of the same name.
    partials_enabled: bool,
    cancelled: Arc<AtomicBool>,
}

impl TransducerProvider {
    /// Create a new Zipformer transducer provider.
    ///
    /// - `model_dir`: directory containing `encoder.int8.onnx`,
    ///   `decoder.int8.onnx`, `joiner.int8.onnx`, `tokens.txt` and, optionally,
    ///   `bpe.vocab` (its presence enables hotword biasing).
    /// - `n_threads`: CPU threads for inference.
    /// - `pause_silence_ms` / `partials_enabled`: identical semantics to
    ///   [`SherpaProvider::new`] (shared VAD engine).
    pub fn new(
        model_dir: PathBuf,
        n_threads: i32,
        pause_silence_ms: Option<u32>,
        partials_enabled: bool,
    ) -> Self {
        Self {
            model_dir,
            n_threads: n_threads.max(1),
            pause_silence_ms: pause_silence_ms
                .unwrap_or(DEFAULT_PAUSE_SILENCE_MS)
                .clamp(300, 5_000),
            partials_enabled,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Absolute path of a file inside the model directory, as an owned `String`.
    fn file(&self, name: &str) -> String {
        self.model_dir.join(name).to_string_lossy().into_owned()
    }
}

impl std::fmt::Debug for TransducerProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TransducerProvider")
            .field("model_dir", &self.model_dir)
            .field("n_threads", &self.n_threads)
            .finish_non_exhaustive()
    }
}

#[async_trait::async_trait]
impl SttProvider for TransducerProvider {
    async fn start(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        self.cancelled.store(false, Ordering::SeqCst);

        // The four core files must be present before we announce Connected.
        if let Some(missing) = missing_transducer_file(&self.model_dir) {
            return Err(SttError::ModelNotFound(format!(
                "Zipformer model file not found: {}",
                missing.display()
            )));
        }

        let encoder = self.file(T_ENCODER);
        let decoder = self.file(T_DECODER);
        let joiner = self.file(T_JOINER);
        let tokens = self.file(TOKENS);
        let n_threads = self.n_threads;

        // Contextual biasing requires a `bpe.vocab` to tokenize word-level
        // hotwords into the model's token space. When it's present, build the
        // hotwords file from the Bible keyterms and turn on beam-search biasing;
        // otherwise decode plainly (the engine still runs, just unbiased). The
        // hotwords file is written to the temp dir because the packaged model
        // dir may be read-only.
        let bpe_vocab_path = self.model_dir.join(T_BPE_VOCAB);
        let biasing = if bpe_vocab_path.exists() {
            match crate::keyterms::write_hotwords_file(&std::env::temp_dir()) {
                Ok(path) => Some((
                    path.to_string_lossy().into_owned(),
                    bpe_vocab_path.to_string_lossy().into_owned(),
                )),
                Err(e) => {
                    log::warn!(
                        "[Sherpa] could not write hotwords file: {e} — decoding without biasing"
                    );
                    None
                }
            }
        } else {
            log::info!(
                "[Sherpa] no bpe.vocab in model dir — Zipformer decoding without hotword biasing"
            );
            None
        };

        let build = move || -> Result<Box<dyn UtteranceRecognizer>, String> {
            // Beam search honors hotwords; greedy search ignores them. Fall back
            // to greedy (faster) only when there's nothing to bias toward.
            let (decoding_method, hotwords_file, hotwords_score, modeling_unit, bpe_vocab) =
                match biasing {
                    Some((hotwords_file, bpe_vocab)) => (
                        "modified_beam_search".to_string(),
                        hotwords_file,
                        2.0,
                        "bpe".to_string(),
                        bpe_vocab,
                    ),
                    None => (
                        "greedy_search".to_string(),
                        String::new(),
                        0.0,
                        String::new(),
                        String::new(),
                    ),
                };

            let config = sherpa_rs::transducer::TransducerConfig {
                encoder,
                decoder,
                joiner,
                tokens,
                num_threads: n_threads,
                sample_rate: 16_000,
                feature_dim: 80,
                decoding_method,
                provider: Some("cpu".into()),
                hotwords_file,
                hotwords_score,
                modeling_unit,
                bpe_vocab,
                ..Default::default()
            };
            sherpa_rs::transducer::TransducerRecognizer::new(config)
                .map(|r| Box::new(TransducerRec(r)) as Box<dyn UtteranceRecognizer>)
                .map_err(|e| format!("Failed to load Zipformer model: {e}"))
        };

        run_engine(
            self.pause_silence_ms,
            self.partials_enabled,
            self.cancelled.clone(),
            "Zipformer",
            audio_rx,
            event_tx,
            build,
        )
        .await
    }

    fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn name(&self) -> &'static str {
        "zipformer"
    }
}

#[cfg(test)]
mod tests {
    use super::{
        missing_moonshine_file, missing_transducer_file, MOONSHINE_MODEL_FILES, T_BPE_VOCAB,
        TRANSDUCER_MODEL_FILES,
    };

    /// A unique temp dir for this test process, created fresh.
    fn temp_model_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir()
            .join(format!("lumenlive-moonshine-{}-{}", std::process::id(), tag));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn empty_dir_reports_first_missing_file() {
        let dir = temp_model_dir("empty");
        // Nothing present → the first required file is reported missing.
        let missing = missing_moonshine_file(&dir).expect("empty dir must be incomplete");
        assert_eq!(missing, dir.join(MOONSHINE_MODEL_FILES[0]));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn complete_dir_reports_none() {
        let dir = temp_model_dir("complete");
        for name in MOONSHINE_MODEL_FILES {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        assert!(
            missing_moonshine_file(&dir).is_none(),
            "a dir with all five files must be ready"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn partial_dir_reports_the_absent_file() {
        let dir = temp_model_dir("partial");
        // Write every file except the last one — a dir that "exists" but is not
        // ready. This is exactly the case the dir-only check used to miss.
        for name in &MOONSHINE_MODEL_FILES[..MOONSHINE_MODEL_FILES.len() - 1] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        let last = MOONSHINE_MODEL_FILES[MOONSHINE_MODEL_FILES.len() - 1];
        let missing = missing_moonshine_file(&dir).expect("partial dir must be incomplete");
        assert_eq!(missing, dir.join(last));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transducer_empty_dir_reports_first_missing_file() {
        let dir = temp_model_dir("t-empty");
        let missing = missing_transducer_file(&dir).expect("empty dir must be incomplete");
        assert_eq!(missing, dir.join(TRANSDUCER_MODEL_FILES[0]));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transducer_core_files_are_enough_bpe_vocab_is_optional() {
        let dir = temp_model_dir("t-core");
        // The four core files, but NOT bpe.vocab.
        for name in TRANSDUCER_MODEL_FILES {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        assert!(
            missing_transducer_file(&dir).is_none(),
            "the four core files must be sufficient — bpe.vocab is optional (biasing on/off)"
        );
        assert!(
            !dir.join(T_BPE_VOCAB).exists(),
            "sanity: this fixture intentionally omits bpe.vocab"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn transducer_partial_dir_reports_the_absent_file() {
        let dir = temp_model_dir("t-partial");
        for name in &TRANSDUCER_MODEL_FILES[..TRANSDUCER_MODEL_FILES.len() - 1] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }
        let last = TRANSDUCER_MODEL_FILES[TRANSDUCER_MODEL_FILES.len() - 1];
        let missing = missing_transducer_file(&dir).expect("partial dir must be incomplete");
        assert_eq!(missing, dir.join(last));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
