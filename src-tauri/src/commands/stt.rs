#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager, State};

use crate::events::{
    AudioLevelPayload, TranscriptPayload, EVENT_AUDIO_LEVEL, EVENT_AUDIO_SOURCE_LOST,
    EVENT_AUDIO_SOURCE_RECOVERED, EVENT_TRANSCRIPT_FINAL, EVENT_TRANSCRIPT_PARTIAL,
};
use crate::bible_state::BibleState;
use crate::state::AppState;

/// Truncate a string to at most `max_bytes`, snapping to a valid UTF-8 char boundary.
fn truncate_safe(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}
use lumenlive_audio::{AudioConfig, AudioFrame};
use lumenlive_stt::{DeepgramClient, SttConfig, SttProvider, TranscriptEvent};

/// Confidence assigned to any direct (Aho-Corasick) reference match. Direct
/// detections are treated as uniformly high-trust, so this is a fixed
/// placeholder rather than a per-match score. It is deliberately >=
/// [`HIGH_CONFIDENCE_THRESHOLD`], so a direct match always clears the
/// high-confidence gate below.
const DIRECT_DETECTION_CONFIDENCE: f64 = 0.95;

/// Minimum confidence for a detection to count as an explicit, high-trust
/// reference — e.g. gating whether a new book restarts reading mode versus
/// being treated as a low-confidence false positive.
const HIGH_CONFIDENCE_THRESHOLD: f64 = 0.90;

/// Resolve the bundled Moonshine model directory (dev tree first, then packaged
/// resources). Shared by the sherpa primary path and the Deepgram→Moonshine
/// offline fallback so both look in exactly the same place.
///   - Dev:  `{CARGO_MANIFEST_DIR}/../models/sherpa/<model>`
///   - Prod: `resource_dir()/models/sherpa/<model>`
#[cfg(feature = "sherpa")]
fn resolve_moonshine_model_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let model_subdir = std::path::Path::new("models")
        .join("sherpa")
        .join("sherpa-onnx-moonshine-base-en-int8");
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(&model_subdir);
    if dev_path.exists() {
        return Ok(dev_path);
    }
    app.path()
        .resource_dir()
        .map(|p| p.join(&model_subdir))
        .ok()
        .filter(|p| p.exists())
        .ok_or_else(|| "Moonshine model not found. Run: bun run download:sherpa".to_string())
}

/// Inference threads for Moonshine — half the logical CPUs, at least one.
#[cfg(feature = "sherpa")]
fn moonshine_thread_count() -> i32 {
    let parallelism = std::thread::available_parallelism().map_or(4, usize::from);
    i32::try_from(parallelism / 2).unwrap_or(2).max(1)
}

/// Lightweight connectivity probe: can we open a TCP connection to the Deepgram
/// API host? Used to detect when the network returns so the supervisor can fail
/// back from on-device Moonshine to the cloud provider. When offline, DNS
/// resolution / the connect fails fast; success means the link is back. Runs on
/// a blocking thread (DNS + connect block) and never touches the STT quota.
async fn deepgram_reachable() -> bool {
    tokio::task::spawn_blocking(|| {
        use std::net::ToSocketAddrs;
        let Ok(mut addrs) = ("api.deepgram.com", 443u16).to_socket_addrs() else {
            return false;
        };
        let Some(addr) = addrs.next() else { return false };
        std::net::TcpStream::connect_timeout(&addr, Duration::from_secs(3)).is_ok()
    })
    .await
    .unwrap_or(false)
}

/// Supervise the STT engines for one transcription session.
///
/// Runs the operator-selected `primary` provider. If it returns an error while
/// `active` is still set — i.e. the cloud provider lost the network, not a user
/// stop — it fails over to the on-device Moonshine `fallback` (when present) and
/// starts a background probe. Once the probe sees connectivity return, it stops
/// Moonshine and loops back to the cloud provider. The on-device dwell backs off
/// when the cloud link keeps failing right after a failback, so a flaky
/// connection doesn't ping-pong. Emits `stt_failover` / `stt_failback` so the UI
/// can show which engine is live. Both providers re-arm on `start()`, so the
/// same instances are reused across cycles (no per-cycle model reload beyond the
/// first Moonshine load).
async fn run_stt_supervisor(
    primary: Box<dyn SttProvider>,
    fallback: Option<std::sync::Arc<dyn SttProvider>>,
    audio_rx: crossbeam_channel::Receiver<Vec<i16>>,
    event_tx: tokio::sync::mpsc::Sender<TranscriptEvent>,
    active: Arc<AtomicBool>,
    app: AppHandle,
    primary_name: String,
) {
    // Longest we'll stay on-device between probes on a flaky link, and how long
    // between probes for the network's return.
    const MAX_DWELL: Duration = Duration::from_secs(60);
    const PROBE_INTERVAL: Duration = Duration::from_secs(5);

    // Minimum time on-device before we start probing for the network. Grows when
    // the cloud link proves flaky (fails again right after a failback).
    let mut on_device_dwell = Duration::from_secs(5);

    loop {
        if !active.load(Ordering::SeqCst) {
            break;
        }

        // ── Cloud/primary phase ──
        let cloud_started = Instant::now();
        let result = primary.start(audio_rx.clone(), event_tx.clone()).await;

        // A clean return (Ok) or a user stop ends the session.
        if !active.load(Ordering::SeqCst) || result.is_ok() {
            break;
        }
        log::error!("[STT-{primary_name}] provider failed: {:?}", result.err());

        let Some(fallback) = fallback.clone() else {
            // No on-device engine to fall back to — surface a real error and stop.
            let _ = app.emit(
                "stt_error",
                "Connection lost and no on-device fallback is available.",
            );
            break;
        };

        // Flaky-link back-off: if the cloud phase died almost immediately after a
        // failback, lengthen the on-device dwell; otherwise reset it.
        if cloud_started.elapsed() < Duration::from_secs(8) {
            on_device_dwell = (on_device_dwell * 2).min(MAX_DWELL);
        } else {
            on_device_dwell = Duration::from_secs(5);
        }

        log::warn!(
            "[STT] {primary_name} unreachable — failing over to on-device Moonshine (dwell {on_device_dwell:?})"
        );
        let _ = app.emit(
            "stt_failover",
            "Network lost — switched to on-device transcription",
        );

        // ── On-device phase: run Moonshine and probe for the network in parallel ──
        let net_back = Arc::new(AtomicBool::new(false));

        let moon = {
            let fallback = fallback.clone();
            let audio_rx = audio_rx.clone();
            let event_tx = event_tx.clone();
            tauri::async_runtime::spawn(async move {
                let _ = fallback.start(audio_rx, event_tx).await;
            })
        };

        let probe = {
            let net_back = net_back.clone();
            let active = active.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(on_device_dwell).await;
                while active.load(Ordering::SeqCst) && !net_back.load(Ordering::SeqCst) {
                    if deepgram_reachable().await {
                        net_back.store(true, Ordering::SeqCst);
                        break;
                    }
                    tokio::time::sleep(PROBE_INTERVAL).await;
                }
            })
        };

        // Wait for the network to return or the user to stop, then tear down
        // Moonshine so the next cloud phase (or shutdown) can proceed.
        loop {
            if !active.load(Ordering::SeqCst) || net_back.load(Ordering::SeqCst) {
                fallback.stop();
                break;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        probe.abort();
        let _ = moon.await;

        if !active.load(Ordering::SeqCst) {
            break;
        }

        log::info!("[STT] network restored — returning to {primary_name}");
        let _ = app.emit(
            "stt_failback",
            "Network restored — switched back to cloud transcription",
        );
    }

    active.store(false, Ordering::SeqCst);
    log::info!("[STT-{primary_name}] supervisor exited");
}

/// Start the full audio-capture-to-transcription pipeline.
///
/// 1. Opens the microphone via cpal (on a dedicated thread so the non-Send
///    `AudioCapture` never crosses thread boundaries).
/// 2. Connects to the selected STT provider (Deepgram cloud or Moonshine local).
/// 3. Fans audio out to both the level meter (emits `audio_level` events) and STT.
/// 4. Receives transcripts and emits `transcript_partial` / `transcript_final` events.
/// 5. On final transcripts, runs the detection pipeline and emits `verse_detected` events.
#[expect(clippy::too_many_lines, reason = "pipeline setup is inherently complex")]
#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    api_key: String,
    device_id: Option<String>,
    gain: Option<f32>,
    provider: Option<String>,
    pause_silence_ms: Option<u32>,
) -> Result<(), String> {
    // ── 1. Guard: already running? ──────────────────────────────────────
    let (stt_active, audio_active) = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        if app_state.stt_active.load(Ordering::Relaxed) {
            return Err("Transcription is already running".into());
        }
        (app_state.stt_active.clone(), app_state.audio_active.clone())
    };

    let provider_name = provider.as_deref().unwrap_or("deepgram");

    // ── 2. Build the STT provider ───────────────────────────────────────
    let stt_provider: Box<dyn SttProvider> = match provider_name {
        #[cfg(feature = "sherpa")]
        "sherpa" => {
            let model_dir = resolve_moonshine_model_dir(&app)?;
            let n_threads = moonshine_thread_count();

            log::info!(
                "Starting sherpa (Moonshine) transcription: model_dir={}, threads={n_threads}, device_id={device_id:?}, pause_silence_ms={pause_silence_ms:?}",
                model_dir.display()
            );

            Box::new(lumenlive_stt::SherpaProvider::new(
                model_dir,
                n_threads,
                pause_silence_ms,
            ))
        }
        #[cfg(not(feature = "sherpa"))]
        "sherpa" => {
            return Err(
                "Sherpa support not compiled. Rebuild with --features sherpa".into(),
            );
        }
        _ => {
            // Deepgram (default)
            let resolved_api_key = if api_key.is_empty() {
                std::env::var("DEEPGRAM_API_KEY").unwrap_or_default()
            } else {
                api_key
            };

            if resolved_api_key.is_empty() {
                return Err(
                    "No Deepgram API key provided. Set it in Settings or via DEEPGRAM_API_KEY env var."
                        .into(),
                );
            }

            log::info!(
                "Starting Deepgram transcription: api_key={}..., device_id={device_id:?}, gain={gain:?}",
                truncate_safe(&resolved_api_key, 8)
            );

            let stt_config = SttConfig {
                api_key: resolved_api_key,
                model: "nova-3".to_string(),
                sample_rate: 16_000,
                encoding: "linear16".to_string(),
                language: None,
            };

            Box::new(DeepgramClient::new(stt_config))
        }
    };

    // Offline failover: if the cloud provider loses the network mid-service,
    // continue transcribing on-device with Moonshine instead of going dark.
    // Built eagerly here (cheap — it only stores paths; the model is loaded
    // lazily when the fallback's start() actually runs). `None` when the primary
    // is already Moonshine, or when the model isn't available.
    #[cfg(feature = "sherpa")]
    let stt_fallback: Option<Box<dyn SttProvider>> = if provider_name == "sherpa" {
        None
    } else {
        match resolve_moonshine_model_dir(&app) {
            Ok(dir) => Some(Box::new(lumenlive_stt::SherpaProvider::new(
                dir,
                moonshine_thread_count(),
                pause_silence_ms,
            ))),
            Err(e) => {
                log::warn!("[STT] Offline fallback unavailable: {e}");
                None
            }
        }
    };
    #[cfg(not(feature = "sherpa"))]
    let stt_fallback: Option<Box<dyn SttProvider>> = None;

    stt_active.store(true, Ordering::SeqCst);
    audio_active.store(true, Ordering::SeqCst);

    // ── 3. Prepare channels ─────────────────────────────────────────────
    let (audio_send_tx, audio_send_rx) = crossbeam_channel::bounded::<Vec<i16>>(64);

    // ── 4. Spawn the audio-capture + fan-out thread ─────────────────────
    // cpal's `Stream` (inside `AudioCapture`) is !Send, so we must create
    // and drop it on the same thread. This thread:
    //   a) starts the cpal capture
    //   b) reads AudioFrames
    //   c) computes levels → emits audio_level events
    //   d) forwards samples to STT provider via crossbeam
    let gain_val = gain.unwrap_or(1.0).clamp(0.0, 2.0);
    let fan_active = stt_active.clone();
    let fan_app = app.clone();

    std::thread::Builder::new()
        .name("audio-fanout".into())
        .spawn(move || {
            // Watchdog flag — set by cpal's stream-error callback when the OS
            // device vanishes. The outer loop polls this (and frame silence)
            // to detect loss and rebuild the capture once the device returns.
            let device_lost = Arc::new(AtomicBool::new(false));
            let mut frame_count: u64 = 0;
            let mut announced_lost = false;

            // Outer loop: rebuild `AudioCapture` whenever the device is lost
            // and reappears. Exits only when `fan_active` is cleared by
            // `stop_transcription`.
            'outer: loop {
                if !fan_active.load(Ordering::SeqCst) {
                    break 'outer;
                }

                let config = AudioConfig {
                    device_id: device_id.clone(),
                    sample_rate: 16_000,
                    gain: gain_val,
                };

                let (audio_tx, audio_rx) = crossbeam_channel::bounded::<AudioFrame>(64);
                device_lost.store(false, Ordering::SeqCst);

                let capture = match lumenlive_audio::capture::start(
                    config,
                    audio_tx,
                    device_lost.clone(),
                ) {
                    Ok(c) => {
                        if announced_lost {
                            log::info!("[AUDIO] Source recovered — capture rebuilt");
                            let _ = fan_app.emit(EVENT_AUDIO_SOURCE_RECOVERED, ());
                            announced_lost = false;
                        }
                        c
                    }
                    Err(e) => {
                        if !announced_lost {
                            log::warn!(
                                "[AUDIO] Source unavailable: {e} — waiting for reconnect"
                            );
                            let _ = fan_app.emit(EVENT_AUDIO_SOURCE_LOST, ());
                            announced_lost = true;
                            // Drop level meter to zero so UI reflects the gap.
                            let _ = fan_app.emit(
                                EVENT_AUDIO_LEVEL,
                                AudioLevelPayload { rms: 0.0, peak: 0.0 },
                            );
                        }
                        std::thread::sleep(Duration::from_millis(750));
                        continue 'outer;
                    }
                };

                log::info!("Audio capture started on fanout thread");

                let mut last_frame_at = Instant::now();

                // Inner loop: pump frames until loss is detected or stop is requested.
                loop {
                    if !fan_active.load(Ordering::SeqCst) {
                        capture.stop();
                        break 'outer;
                    }

                    // Loss signal #1: cpal's err_fn fired.
                    // Loss signal #2: no frames for >2s (some platforms silently
                    // stop delivering rather than calling err_fn).
                    if device_lost.load(Ordering::SeqCst)
                        || last_frame_at.elapsed() > Duration::from_secs(2)
                    {
                        log::warn!(
                            "[AUDIO] Source lost (err_flag={}, silent_for={:?}) — dropping capture",
                            device_lost.load(Ordering::SeqCst),
                            last_frame_at.elapsed()
                        );
                        if !announced_lost {
                            let _ = fan_app.emit(EVENT_AUDIO_SOURCE_LOST, ());
                            let _ = fan_app.emit(
                                EVENT_AUDIO_LEVEL,
                                AudioLevelPayload { rms: 0.0, peak: 0.0 },
                            );
                            announced_lost = true;
                        }
                        break; // drop `capture`, outer loop rebuilds
                    }

                    match audio_rx.recv_timeout(Duration::from_millis(100)) {
                        Ok(frame) => {
                            last_frame_at = Instant::now();
                            frame_count += 1;

                            // (a) Compute audio levels at ~15 Hz
                            //     At 16 kHz with ~1024-sample frames, every 4th frame is ~15 Hz.
                            if frame_count % 4 == 0 {
                                let level = lumenlive_audio::meter::compute_level(&frame.samples);
                                let _ = fan_app.emit(
                                    EVENT_AUDIO_LEVEL,
                                    AudioLevelPayload {
                                        rms: level.rms,
                                        peak: level.peak,
                                    },
                                );
                            }

                            // (b) Forward all audio to STT provider
                            let _ = audio_send_tx.try_send(frame.samples);
                        }
                        Err(crossbeam_channel::RecvTimeoutError::Timeout) => {}
                        Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                            // Capture's sender was dropped — fall through to rebuild.
                            break;
                        }
                    }
                }

                // Dropping `capture` stops the cpal stream.
                capture.stop();
            }

            log::info!("Audio capture stopped on fanout thread");
        })
        .map_err(|e| {
            stt_active.store(false, Ordering::SeqCst);
            audio_active.store(false, Ordering::SeqCst);
            format!("Failed to spawn audio fanout thread: {e}")
        })?;

    // ── 5. Spawn the STT provider on the tokio runtime ──────────────────
    let (event_tx, mut event_rx) = tokio::sync::mpsc::channel::<TranscriptEvent>(64);

    let conn_active = stt_active.clone();
    let provider_log_name = stt_provider.name().to_string();
    let supervisor_app = app.clone();

    // Share the on-device fallback so the supervisor can both run it and stop it
    // (to fail back) from separate tasks.
    let stt_fallback: Option<std::sync::Arc<dyn SttProvider>> =
        stt_fallback.map(std::sync::Arc::from);

    // Task A: supervise the STT engines — run the selected provider, fail over to
    // on-device Moonshine when the cloud provider loses the network, and fail
    // back to the cloud provider once connectivity returns.
    tauri::async_runtime::spawn(run_stt_supervisor(
        stt_provider,
        stt_fallback,
        audio_send_rx,
        event_tx,
        conn_active,
        supervisor_app,
        provider_log_name,
    ));

    // Task B: consume TranscriptEvents, emit to frontend, run detection
    let evt_active = stt_active.clone();
    let event_app = app.clone();

    // Background semantic detection channel — non-blocking, drops if busy
    let (semantic_tx, mut semantic_rx) = tokio::sync::mpsc::channel::<String>(4);

    // Background detection channel — direct + reading mode, non-blocking
    let (detect_tx, mut detect_rx) = tokio::sync::mpsc::channel::<String>(16);

    // [DIAG] Counters so we can see whether transcripts are being dropped
    // because the detection workers can't keep up. Logged every 25 sends
    // alongside current queue depth.
    let detect_sent = Arc::new(AtomicU64::new(0));
    let detect_dropped = Arc::new(AtomicU64::new(0));
    let semantic_sent = Arc::new(AtomicU64::new(0));
    let semantic_dropped = Arc::new(AtomicU64::new(0));

    // Spawn semantic detection worker (runs ONNX inference without blocking transcript).
    // Uses spawn_blocking so ONNX doesn't starve the tokio async runtime
    // (WebSocket readers, event emitters, etc.).
    let sem_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(text) = semantic_rx.recv().await {
            let app_clone = sem_app.clone();
            let _ = tokio::task::spawn_blocking(move || {
                run_semantic_detection(&app_clone, &text);
            })
            .await;
        }
    });

    // Spawn detection worker (runs direct detection + reading mode without blocking
    // transcript delivery). Uses spawn_blocking so mutex locks and DB I/O don't
    // starve the tokio runtime.
    let det_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(transcript) = detect_rx.recv().await {
            let app_clone = det_app.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let direct_found = run_direct_detection(&app_clone, &transcript);
                check_reading_mode(&app_clone, &transcript, direct_found);
            })
            .await;
        }
    });

    let detect_sent_evt = detect_sent.clone();
    let detect_dropped_evt = detect_dropped.clone();
    let semantic_sent_evt = semantic_sent.clone();
    let semantic_dropped_evt = semantic_dropped.clone();

    tauri::async_runtime::spawn(async move {
        // [LATENCY] First-transcript instrumentation. Attributes "slow first
        // transcript" to its real cause by timing the first partial/final
        // against three reference points: session start, the cloud connect, and
        // when the speaker actually started talking. Logged once per session.
        let session_start = Instant::now();
        let mut connected_at: Option<Instant> = None;
        let mut speech_started_at: Option<Instant> = None;
        let mut first_partial_logged = false;
        let mut first_final_logged = false;

        while let Some(event) = event_rx.recv().await {
            if !evt_active.load(Ordering::SeqCst) {
                break;
            }

            match event {
                TranscriptEvent::Partial { transcript, .. } => {
                    if !transcript.is_empty() {
                        if !first_partial_logged {
                            first_partial_logged = true;
                            let after_connect = connected_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            let after_speech = speech_started_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            log::info!(
                                "[LATENCY] first partial: {:?} after start | {after_connect} after connect | {after_speech} after speech-start",
                                session_start.elapsed()
                            );
                        }
                        let t0 = std::time::Instant::now();
                        let _ = event_app.emit(
                            EVENT_TRANSCRIPT_PARTIAL,
                            TranscriptPayload {
                                text: transcript.clone(),
                                is_final: false,
                                confidence: 0.0,
                            },
                        );

                        // Check for translation commands on partials too (cheap string matching)
                        // This makes translation switching feel instant without waiting for speech_final
                        check_translation_command(&event_app, &transcript);
                        log::debug!("[EVT] Partial processed in {:?}", t0.elapsed());
                    }
                }
                TranscriptEvent::Final {
                    transcript,
                    confidence,
                    speech_final,
                    ..
                } => {
                    if !transcript.is_empty() {
                        if !first_final_logged {
                            first_final_logged = true;
                            let after_connect = connected_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            let after_speech = speech_started_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            log::info!(
                                "[LATENCY] first final: {:?} after start | {after_connect} after connect | {after_speech} after speech-start",
                                session_start.elapsed()
                            );
                        }
                        let t0 = std::time::Instant::now();
                        // Emit as permanent transcript segment IMMEDIATELY
                        // (never blocked by detection work)
                        let _ = event_app.emit(
                            EVENT_TRANSCRIPT_FINAL,
                            TranscriptPayload {
                                text: transcript.clone(),
                                is_final: true,
                                confidence,
                            },
                        );

                        // Check for translation commands (cheap, <1ms, stays inline)
                        check_translation_command(&event_app, &transcript);

                        // Fire-and-forget: detection runs in background thread pool.
                        // Event consumer proceeds immediately to next transcript.
                        if let Ok(()) = detect_tx.try_send(transcript.clone()) {
                            let n = detect_sent_evt.fetch_add(1, Ordering::Relaxed) + 1;
                            if n % 25 == 0 {
                                let depth = detect_tx.max_capacity() - detect_tx.capacity();
                                let dropped = detect_dropped_evt.load(Ordering::Relaxed);
                                log::info!(
                                    "[QUEUE] detect_tx sent={n} dropped={dropped} depth={depth}/{}",
                                    detect_tx.max_capacity()
                                );
                            }
                        } else {
                            let d = detect_dropped_evt.fetch_add(1, Ordering::Relaxed) + 1;
                            let sent = detect_sent_evt.load(Ordering::Relaxed);
                            log::warn!(
                                "[QUEUE] detect_tx DROPPED (consumer behind) sent={sent} dropped={d}"
                            );
                        }

                        // Semantic detection runs ONNX vector search (~300-600ms),
                        // so gate it to utterance boundaries (`speech_final`) instead
                        // of every partial fragment. Moonshine/REST set this true on
                        // every Final; Deepgram sets it only at end-of-speech, which
                        // keeps the capacity-bounded semantic channel from backing up.
                        if speech_final {
                            if let Ok(()) = semantic_tx.try_send(transcript.clone()) {
                                let n = semantic_sent_evt.fetch_add(1, Ordering::Relaxed) + 1;
                                if n % 25 == 0 {
                                    let depth = semantic_tx.max_capacity() - semantic_tx.capacity();
                                    let dropped = semantic_dropped_evt.load(Ordering::Relaxed);
                                    log::info!(
                                        "[QUEUE] semantic_tx sent={n} dropped={dropped} depth={depth}/{}",
                                        semantic_tx.max_capacity()
                                    );
                                }
                            } else {
                                let d = semantic_dropped_evt.fetch_add(1, Ordering::Relaxed) + 1;
                                let sent = semantic_sent_evt.load(Ordering::Relaxed);
                                log::warn!(
                                    "[QUEUE] semantic_tx DROPPED (consumer behind) sent={sent} dropped={d}"
                                );
                            }
                        }

                        log::debug!("[EVT] Final processed in {:?} ({:?})", t0.elapsed(), truncate_safe(&transcript, 40));
                    }
                }
                TranscriptEvent::UtteranceEnd => {}
                TranscriptEvent::SpeechStarted => {
                    // Capture the first utterance's onset for latency attribution.
                    if speech_started_at.is_none() {
                        speech_started_at = Some(Instant::now());
                    }
                    let _ = event_app.emit("stt_speech_started", ());
                }
                TranscriptEvent::Error(msg) => {
                    log::error!("[STT] Error: {msg}");
                    let _ = event_app.emit("stt_error", msg);
                }
                TranscriptEvent::Connected => {
                    if connected_at.is_none() {
                        connected_at = Some(Instant::now());
                    }
                    log::info!("[STT] Connected");
                    let _ = event_app.emit("stt_connected", ());
                }
                TranscriptEvent::Disconnected => {
                    log::warn!("[STT] Disconnected");
                    let _ = event_app.emit("stt_disconnected", ());
                }
            }
        }

        log::info!("Transcript event consumer task exited");
    });

    Ok(())
}

/// Run direct (regex/pattern) detection only. Instant, no ONNX.
/// Locks its own `Mutex<DirectDetector>` (so it never blocks on the semantic
/// worker's ONNX under the pipeline lock) but merges through the SHARED
/// `Mutex<DetectionMerger>` — the same instance the semantic worker uses — so
/// the anti-flood cooldown coordinates across both channels.
/// Returns true if high-confidence results were found (>= 0.90).
#[expect(clippy::similar_names, reason = "merger and merged are naturally named")]
fn run_direct_detection(app: &AppHandle, transcript: &str) -> bool {
    use lumenlive_detection::{DirectDetector, DetectionMerger};

    let t0 = std::time::Instant::now();
    let detector_state: State<'_, Mutex<DirectDetector>> = app.state();
    let mut detector = match detector_state.lock() {
        Ok(d) => d,
        Err(e) => {
            log::error!("Failed to lock DirectDetector: {e}");
            return false;
        }
    };
    let direct_results = detector.detect(transcript);
    drop(detector); // Release immediately

    if direct_results.is_empty() {
        return false;
    }

    // Check if any result has high confidence before merging
    let has_high_confidence = direct_results.iter().any(|d| d.confidence >= HIGH_CONFIDENCE_THRESHOLD);

    // Merge using the managed merger (persists cooldown state across calls,
    // preventing duplicate emissions when running on both partials and finals)
    let merger_state: State<'_, Mutex<DetectionMerger>> = app.state();
    let mut merger = match merger_state.lock() {
        Ok(m) => m,
        Err(e) => {
            log::error!("Failed to lock DetectionMerger: {e}");
            return false;
        }
    };
    let merged = merger.merge(direct_results, vec![]);
    drop(merger);
    if merged.is_empty() {
        return false;
    }

    // Resolve verse info from the dedicated Bible DB lock. A blocking lock is
    // fine here — this runs inside spawn_blocking (not on the async runtime)
    // and DB lookups are short, so verse text is always resolved. (Previously
    // this used try_lock against the shared AppState mutex and, on contention
    // with the semantic worker, emitted detections without verse text.)
    let bible_managed: State<'_, Mutex<BibleState>> = app.state();
    let Ok(bible) = bible_managed.lock() else {
        log::error!("[DET-DIRECT] BibleState lock poisoned");
        return false;
    };
    let results: Vec<super::detection::DetectionResult> = merged
        .iter()
        .map(|m| super::detection::to_result(&bible, m))
        .collect();
    drop(bible);

    for r in &results {
        log::info!("[DET-DIRECT] Found: {} ({:.0}%)", r.verse_ref, r.confidence * 100.0);
    }
    let _ = app.emit("verse_detections", &results);
    log::info!("[DET-DIRECT] Detection took {:?} for {:?}", t0.elapsed(), truncate_safe(transcript, 50));
    has_high_confidence
}

/// Minimum words before vector embedding search is worthwhile (short text
/// lacks semantic signal). Matches the pipeline's own gate.
const SEMANTIC_MIN_WORDS: usize = 5;

/// Confidence boost applied when vector search and FTS5 keyword search agree
/// on the same verse — agreement is the strongest signal.
const AGREEMENT_BOOST: f64 = 0.15;

/// Confidence assigned to the best keyword-only (FTS5) match. Deliberately
/// low so keyword false-positives rank below real vector matches and do not
/// auto-queue on their own; they serve as recall candidates only.
const FTS_ONLY_BASE: f64 = 0.55;

/// Confidence decrease per FTS5 rank position for keyword-only matches.
const FTS_ONLY_DECAY: f64 = 0.03;

/// Keyword-only matches below this are dropped entirely.
const FTS_ONLY_FLOOR: f64 = 0.40;

/// Upper bound on fused confidence.
const MAX_FUSED_CONFIDENCE: f64 = 0.98;

/// Run hybrid semantic detection with score fusion: real ONNX vector search is
/// the primary signal, FTS5 BM25 keyword search is a supporting one.
///
/// Fusion rules (per verse):
/// - **vector + keyword agree** → vector similarity + [`AGREEMENT_BOOST`] (wins)
/// - **vector only** (paraphrase) → vector similarity on merit
/// - **keyword only** (possible false-positive) → low fallback confidence that
///   ranks below vector matches and does not auto-queue
///
/// A verbatim quote naturally lands as "both agree" with very high vector
/// similarity, so it wins without a special case. Runs inside `spawn_blocking`,
/// gated to `speech_final` so ONNX (~300-600ms) does not run on every fragment.
#[allow(
    clippy::too_many_lines,
    reason = "single-purpose orchestration of the semantic-detection hot path; \
              splitting it would fragment the fused vector+FTS flow"
)]
fn run_semantic_detection(app: &AppHandle, transcript: &str) {
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    use lumenlive_detection::{Detection, DetectionMerger, DetectionPipeline, DetectionSource, VerseRef};
    use lumenlive_detection::quotation;

    // Per-verse aggregation across the vector + FTS signals. Declared up-front
    // (before any statement) per clippy::items_after_statements.
    struct Agg {
        book_number: i32,
        book_name: String,
        chapter: i32,
        verse: i32,
        vsim: Option<f64>,
        frank: Option<usize>,
        /// Candidate verse text, when resolved (vector hits carry it via
        /// `get_verse_by_id`; FTS-only hits leave it `None`). Enables the
        /// verbatim-overlap quotation signal.
        text: Option<String>,
    }

    let t0 = std::time::Instant::now();
    log::info!("[DET-SEMANTIC] Running on: {:?}", truncate_safe(transcript, 80));

    // 1. Vector search (real cosine similarities). Empty when the index is not
    //    loaded or the text is too short for a meaningful embedding.
    let vector_hits: Vec<(i64, f64)> = {
        let pipeline_state: State<'_, Mutex<DetectionPipeline>> = app.state();
        let Ok(mut pipeline) = pipeline_state.lock() else {
            log::error!("[DET-SEMANTIC] Failed to lock DetectionPipeline");
            return;
        };
        if transcript.split_whitespace().count() >= SEMANTIC_MIN_WORDS {
            pipeline.semantic_search(transcript, 10)
        } else {
            Vec::new()
        }
    };

    // 2. FTS5 keyword recall + fuse both signals into per-verse detections.
    //    Vector hits carry a verse_id (resolved here to a book/chapter/verse
    //    reference); FTS hits carry a reference. Fusing on the reference lets
    //    us detect agreement and dedup at the same time.
    let fused: Vec<Detection> = {
        let managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(bible) = managed.lock() else {
            log::error!("[DET-SEMANTIC] Failed to lock BibleState");
            return;
        };
        let Some(db) = bible.db.as_ref() else {
            log::warn!("[DET-SEMANTIC] bible.db is None — database not loaded");
            return;
        };

        let fts_hits = match db.search_verses_bm25(transcript, 10) {
            Ok(r) => r,
            Err(e) => {
                log::error!("[DET-SEMANTIC] FTS5 query failed: {e}");
                Vec::new()
            }
        };

        let mut map: HashMap<(i32, i32, i32), Agg> = HashMap::new();

        // Vector hits: resolve verse_id -> reference, keep best similarity.
        for (vid, sim) in &vector_hits {
            if let Ok(Some(v)) = db.get_verse_by_id(*vid) {
                let e = map.entry((v.book_number, v.chapter, v.verse)).or_insert(Agg {
                    book_number: v.book_number,
                    book_name: v.book_name.clone(),
                    chapter: v.chapter,
                    verse: v.verse,
                    vsim: None,
                    frank: None,
                    text: None,
                });
                e.vsim = Some(e.vsim.map_or(*sim, |p| p.max(*sim)));
                // Keep the candidate verse text for the verbatim-overlap signal.
                e.text.get_or_insert(v.text);
            }
        }

        // FTS hits: record best (lowest) rank per verse.
        for (rank, f) in fts_hits.iter().enumerate() {
            let e = map.entry((f.book_number, f.chapter, f.verse)).or_insert(Agg {
                book_number: f.book_number,
                book_name: f.book_name.clone(),
                chapter: f.chapter,
                verse: f.verse,
                vsim: None,
                frank: None,
                text: None,
            });
            e.frank = Some(e.frank.map_or(rank, |p| p.min(rank)));
        }

        #[expect(clippy::cast_possible_truncation, reason = "timestamp millis won't exceed u64")]
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let snippet = truncate_safe(transcript, 100).to_string();
        map.into_values()
            .filter_map(|a| {
                #[expect(clippy::cast_precision_loss, reason = "rank is small")]
                let confidence = match (a.vsim, a.frank) {
                    // Both agree — strongest signal.
                    (Some(v), Some(_)) => (v + AGREEMENT_BOOST).min(MAX_FUSED_CONFIDENCE),
                    // Vector only — a paraphrase match on merit.
                    (Some(v), None) => v,
                    // Keyword only — low fallback, will not auto-queue.
                    (None, Some(rank)) => {
                        let c = FTS_ONLY_BASE - rank as f64 * FTS_ONLY_DECAY;
                        if c < FTS_ONLY_FLOOR {
                            return None;
                        }
                        c
                    }
                    (None, None) => return None,
                };
                // Modulate by quotation likelihood: dampen matches that lack
                // scripture markers (raising precision against preaching that only
                // alludes to a verse), leave genuine quotations near their raw
                // score. Vector hits contribute verbatim overlap via `a.text`;
                // FTS-only hits fall back to transcript archaic-register + cues.
                let quotation = quotation::quotation_score(transcript, a.text.as_deref());
                let confidence = quotation::adjust_confidence(confidence, quotation);
                Some(Detection {
                    verse_ref: VerseRef {
                        book_number: a.book_number,
                        book_name: a.book_name,
                        chapter: a.chapter,
                        verse_start: a.verse,
                        verse_end: None,
                    },
                    // Resolve by reference against the active translation (not
                    // verse_id, which would pin results to the KJV index).
                    verse_id: None,
                    confidence,
                    source: DetectionSource::Semantic { similarity: confidence },
                    transcript_snippet: snippet.clone(),
                    detected_at: now,
                    is_chapter_only: false,
                })
            })
            .collect()
    };

    if fused.is_empty() {
        log::info!("[DET-SEMANTIC] No detections");
        return;
    }

    // 3. Merge: sort, drop below confidence floor, mark auto-queue (with
    //    cooldown). Uses the SHARED merger — the same instance the direct
    //    worker uses — so the anti-flood cooldown coordinates across both
    //    channels and thresholds sync from the UI.
    let merged = {
        let merger_state: State<'_, Mutex<DetectionMerger>> = app.state();
        let Ok(mut merger) = merger_state.lock() else {
            log::error!("[DET-SEMANTIC] Failed to lock DetectionMerger for merge");
            return;
        };
        merger.merge(Vec::new(), fused)
    };

    if merged.is_empty() {
        log::info!("[DET-SEMANTIC] No detections above threshold");
        return;
    }

    // 4. Resolve each merged detection to a full verse result in the active translation.
    let results: Vec<super::detection::DetectionResult> = {
        let managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(bible) = managed.lock() else {
            log::error!("[DET-SEMANTIC] Failed to lock BibleState for verse resolution");
            return;
        };
        merged.iter().map(|m| super::detection::to_result(&bible, m)).collect()
    };

    for r in &results {
        log::info!(
            "[DET-SEMANTIC] Found: {} ({:.0}% {}) auto_q={}",
            r.verse_ref, r.confidence * 100.0, r.source, r.auto_queued
        );
    }
    let _ = app.emit("verse_detections", &results);
    log::info!("[DET-SEMANTIC] Total: {:?}", t0.elapsed());
}

/// Check reading mode: if active, test transcript against expected verse.
/// If direct detection just found a new verse, start/restart reading mode.
/// Returns `true` when reading mode handled the transcript (suppresses semantic).
#[expect(clippy::too_many_lines, reason = "sequential state-machine logic is clearer in one flow")]
fn check_reading_mode(app: &AppHandle, transcript: &str, direct_found: bool) -> bool {
    use lumenlive_detection::ReadingMode;

    // If direct detection found a verse, consider starting/restarting reading mode.
    // BUT: if reading mode is already active on a book/chapter, do NOT restart
    // on a different book — false positives from bare numbers (e.g., "verse 5"
    // getting matched as "Job 3:5") would hijack the reading session.
    if direct_found {
        let verse_info = {
            let detector_state: State<'_, Mutex<lumenlive_detection::DirectDetector>> = app.state();
            let Ok(detector) = detector_state.lock() else { return false };
            detector.recent_detections().front().cloned()
        };

        if let Some(recent) = verse_info {
            // Get the confidence of the detection to distinguish explicit refs from false positives
            let detection_confidence = {
                let detector_state: State<'_, Mutex<lumenlive_detection::DirectDetector>> = app.state();
                detector_state.lock().ok()
                    .and_then(|d| d.recent_detections().front().map(|_| DIRECT_DETECTION_CONFIDENCE))
                    .unwrap_or(0.0)
            };

            let should_start = {
                let rm_managed: &Mutex<ReadingMode> = app.state::<Mutex<ReadingMode>>().inner();
                match rm_managed.lock() {
                    Ok(rm) => {
                        if !rm.is_active() && !rm.has_verses() {
                            true // Not active, no verses loaded — start fresh
                        } else if !rm.is_active() && rm.has_verses() {
                            // Paused — restart on any new explicit reference
                            true
                        } else if rm.current_book() == recent.book_number
                            && rm.current_chapter() == recent.chapter {
                            false // Same book+chapter — already tracking this
                        } else if rm.current_book() != recent.book_number
                            && detection_confidence >= HIGH_CONFIDENCE_THRESHOLD {
                            // Different book with high confidence — explicit new reference
                            // (e.g., "John 1:1" after reading Exodus). Restart.
                            true
                        } else if rm.current_book() == recent.book_number {
                            // Same book, different chapter — natural progression
                            true
                        } else {
                            // Different book, low confidence — likely false positive
                            false
                        }
                    }
                    Err(_) => false,
                }
            };

            if should_start {
                let chapter_data = {
                    let t_db = std::time::Instant::now();
                    let bible_managed: State<'_, Mutex<BibleState>> = app.state();
                    // Blocking lock is OK — we're inside spawn_blocking, not on the async runtime.
                    let Ok(bible) = bible_managed.lock() else {
                        log::error!("[READING] BibleState lock poisoned");
                        return false;
                    };
                    let result = match &bible.db {
                        Some(db) => db.get_chapter(bible.active_translation_id, recent.book_number, recent.chapter).ok(),
                        None => None,
                    };
                    log::info!("[READING] get_chapter took {:?}", t_db.elapsed());
                    result
                };

                if let Some(chapter_verses) = chapter_data {
                    let verses: Vec<(i32, String)> = chapter_verses
                        .into_iter()
                        .map(|v| (v.verse, v.text))
                        .collect();

                    let rm_managed: &Mutex<ReadingMode> = app.state::<Mutex<ReadingMode>>().inner();
                    if let Ok(mut rm) = rm_managed.lock() {
                        rm.start(
                            recent.book_number,
                            &recent.book_name,
                            recent.chapter,
                            recent.verse_start,
                            verses,
                        );

                        // Check if transcript contains "chapter" keyword - if so, expect chapter number next
                        // This handles "Genesis chapter" → pause → "5" → go to chapter 5
                        let lower = transcript.to_lowercase();
                        if lower.contains("chapter") && !lower.contains("next") && !lower.contains("previous") {
                            rm.set_expecting_chapter();
                        }
                    }
                }
            }
        }
    }

    let rm_managed: &Mutex<ReadingMode> = app.state::<Mutex<ReadingMode>>().inner();

    // Check for chapter navigation commands (e.g., "let's go to chapter seven").
    {
        let chapter_change = {
            let Ok(mut rm) = rm_managed.lock() else { return false };
            if !rm.is_active() && !rm.has_verses() {
                None
            } else {
                log::info!("[READING] Checking chapter command for: {transcript:?}");
                rm.check_chapter_command(transcript)
            }
        };

        if let Some(change) = chapter_change {
            let chapter_data = {
                let t_db = std::time::Instant::now();
                let bible_managed: State<'_, Mutex<BibleState>> = app.state();
                // Blocking lock is OK — we're inside spawn_blocking, not on the async runtime.
                let Ok(bible) = bible_managed.lock() else {
                    log::error!("[READING] BibleState lock poisoned (chapter nav)");
                    return false;
                };
                let result = match &bible.db {
                    Some(db) => db.get_chapter(
                        bible.active_translation_id,
                        change.book_number,
                        change.new_chapter,
                    ).ok(),
                    None => None,
                };
                log::info!("[READING] get_chapter (nav) took {:?}", t_db.elapsed());
                result
            };

            if let Some(chapter_verses) = chapter_data {
                if !chapter_verses.is_empty() {
                    let start_verse = change.start_verse.unwrap_or(1);

                    // Find the text for the starting verse
                    let start_verse_text = chapter_verses
                        .iter()
                        .find(|v| v.verse == start_verse).map_or_else(|| chapter_verses[0].text.clone(), |v| v.text.clone());

                    let verses: Vec<(i32, String)> = chapter_verses
                        .into_iter()
                        .map(|v| (v.verse, v.text))
                        .collect();

                    if let Ok(mut rm) = rm_managed.lock() {
                        rm.start(
                            change.book_number,
                            &change.book_name,
                            change.new_chapter,
                            start_verse,
                            verses,
                        );
                    }

                    // Emit the starting verse of the new chapter
                    let reference = format!("{} {}:{}", change.book_name, change.new_chapter, start_verse);
                    let advance = lumenlive_detection::ReadingAdvance {
                        book_number: change.book_number,
                        book_name: change.book_name.clone(),
                        chapter: change.new_chapter,
                        verse: start_verse,
                        verse_text: start_verse_text.clone(),
                        reference: reference.clone(),
                        confidence: 1.0,
                    };
                    let _ = app.emit("reading_mode_verse", &advance);

                    return true;
                }
            }
        }
    }

    // Check reading mode for verse advancement.
    // Allow check even when paused (has_verses but !active) so "verse N"
    // commands can re-activate reading mode after timeout.
    let advance = {
        let Ok(mut rm) = rm_managed.lock() else { return false };
        if !rm.is_active() && !rm.has_verses() {
            return false;
        }
        rm.check_transcript(transcript)
    };

    if let Some(advance) = advance {
        let _ = app.emit("reading_mode_verse", &advance);
        return true;
    }

    false
}

/// Check for voice translation commands like "read in KJV", "read in Spanish".
fn check_translation_command(app: &AppHandle, transcript: &str) {
    #[derive(serde::Serialize, Clone)]
    struct TranslationSwitch {
        abbreviation: String,
        translation_id: i64,
    }

    let detector_state: State<'_, Mutex<lumenlive_detection::DirectDetector>> = app.state();
    let Ok(detector) = detector_state.lock() else { return };

    if let Some(abbrev) = detector.detect_translation_command(transcript) {
        drop(detector);

        // Find the translation ID for this abbreviation
        let managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(mut bible) = managed.try_lock() else { return };

        if let Some(ref db) = bible.db {
            if let Ok(translations) = db.list_translations() {
                if let Some(t) = translations.iter().find(|t| t.abbreviation == abbrev) {
                    bible.active_translation_id = t.id;
                    log::info!("[STT] Voice command: switched to {abbrev} (id={})", t.id);
                    drop(bible);

                    let _ = app.emit("translation_command", TranslationSwitch {
                        abbreviation: abbrev,
                        translation_id: t.id,
                    });
                }
            }
        }
    }
}

/// Stop the transcription pipeline (audio capture + STT provider).
#[tauri::command]
pub fn stop_transcription(
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;

    if !app_state.stt_active.load(Ordering::Relaxed) {
        return Err("Transcription is not running".into());
    }

    // Setting these flags causes the background threads/tasks to exit.
    app_state.stt_active.store(false, Ordering::SeqCst);
    app_state.audio_active.store(false, Ordering::SeqCst);

    log::info!("Transcription stop requested");
    Ok(())
}

