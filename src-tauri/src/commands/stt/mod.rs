#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

//! Speech-to-text pipeline commands and its supporting modules.
//!
//! `start_transcription` wires the pieces together; the real work lives in
//! focused submodules:
//!   - [`model`] — STT provider construction
//!   - [`audio`] — the `!Send` cpal capture + fan-out thread
//!   - [`supervisor`] — provider supervision + disconnect surfacing
//!   - [`events`] — transcript-event consumer + background detection workers
//!   - [`detection`] — the live direct/semantic/reading/translation detection

mod audio;
mod detection;
mod events;
mod model;
mod supervisor;
mod transcript_log;

pub use transcript_log::TranscriptRecorder;

use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

use lumenlive_stt::{SttProvider, TranscriptEvent};

use crate::state::AppState;

/// Truncate a string to at most `max_bytes`, snapping to a valid UTF-8 char boundary.
pub(super) fn truncate_safe(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Start the full audio-capture-to-transcription pipeline.
///
/// 1. Opens the microphone via cpal (on a dedicated thread so the non-Send
///    `AudioCapture` never crosses thread boundaries).
/// 2. Connects to the Deepgram STT provider.
/// 3. Fans audio out to both the level meter (emits `audio_level` events) and STT.
/// 4. Receives transcripts and emits `transcript_partial` / `transcript_final` events.
/// 5. On final transcripts, runs the detection pipeline and emits `verse_detected` events.
#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
    api_key: String,
    device_id: Option<String>,
    gain: Option<f32>,
) -> Result<(), String> {
    // ── 1. Guard: already running? ──────────────────────────────────────
    let (stt_active, audio_active) = {
        let app_state = state.lock().map_err(|e| e.to_string())?;
        if app_state.stt_active.load(Ordering::Relaxed) {
            return Err("Transcription is already running".into());
        }
        (app_state.stt_active.clone(), app_state.audio_active.clone())
    };

    // ── 1b. Reset detector state for a clean session ────────────────────
    // The detectors are process-lifetime singletons; without this a new
    // service inherits the previous run's held refs, sticky context, and
    // cooldown — the root of detection "degrading over time" (aitrans Phase 1).
    detection::reset_detection_state(&app);

    // ── 1c. Begin a durable per-session transcript recording ────────────
    // Every partial/final and every detection is written to its own file
    // under <app_log_dir>/transcripts/ so a whole service's transcript
    // survives — the main app log rotates by size and is overwritten quickly
    // (the reason a prior service's log was gone when we went to diagnose a
    // falsely displayed verse). Best-effort: a missing log dir just skips it.
    match app.path().app_log_dir() {
        Ok(log_dir) => {
            if let Ok(mut rec) = app.state::<Mutex<TranscriptRecorder>>().lock() {
                rec.begin(&log_dir);
            }
        }
        Err(e) => log::error!("[TRANSCRIPT-REC] app_log_dir unavailable, not recording: {e}"),
    }

    // ── 2. Build the STT provider ───────────────────────────────────────
    let stt_provider = model::build_provider(api_key)?;

    stt_active.store(true, Ordering::SeqCst);
    audio_active.store(true, Ordering::SeqCst);

    // ── 3. Prepare the audio channel and spawn the capture/fan-out thread ─
    let (audio_send_tx, audio_send_rx) = crossbeam_channel::bounded::<Vec<i16>>(64);
    audio::spawn_audio_fanout(&app, device_id, gain, &stt_active, &audio_active, audio_send_tx)?;

    // ── 4. Spawn the STT supervisor ─────────────────────────────────────
    let (event_tx, event_rx) = tokio::sync::mpsc::channel::<TranscriptEvent>(64);

    let conn_active = stt_active.clone();
    let provider_log_name = stt_provider.name().to_string();
    let supervisor_app = app.clone();

    let stt_provider: std::sync::Arc<dyn SttProvider> = std::sync::Arc::from(stt_provider);

    tauri::async_runtime::spawn(supervisor::run_stt_supervisor(
        stt_provider,
        audio_send_rx,
        event_tx,
        conn_active,
        supervisor_app,
        provider_log_name,
    ));

    // ── 5. Consume transcripts → emit to UI + fan out to detection workers ─
    events::spawn_transcript_processing(&app, event_rx, &stt_active);

    Ok(())
}

/// Stop the transcription pipeline (audio capture + STT provider).
#[tauri::command]
pub fn stop_transcription(
    state: State<'_, Mutex<AppState>>,
    recorder: State<'_, Mutex<TranscriptRecorder>>,
) -> Result<(), String> {
    let app_state = state.lock().map_err(|e| e.to_string())?;

    if !app_state.stt_active.load(Ordering::Relaxed) {
        return Err("Transcription is not running".into());
    }

    // Setting these flags causes the background threads/tasks to exit.
    app_state.stt_active.store(false, Ordering::SeqCst);
    app_state.audio_active.store(false, Ordering::SeqCst);

    // Flush and close the session transcript file.
    if let Ok(mut rec) = recorder.lock() {
        rec.finish();
    }

    log::info!("Transcription stop requested");
    Ok(())
}
