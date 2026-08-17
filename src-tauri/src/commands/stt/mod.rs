#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

//! Speech-to-text pipeline commands and its supporting modules.
//!
//! `start_transcription` wires the pieces together; the real work lives in
//! focused submodules:
//!   - [`model`] — model resolution + STT provider/fallback construction
//!   - [`audio`] — the `!Send` cpal capture + fan-out thread
//!   - [`supervisor`] — provider supervision with cloud↔on-device failover
//!   - [`events`] — transcript-event consumer + background detection workers
//!   - [`detection`] — the live direct/semantic/reading/translation detection

mod audio;
mod detection;
mod events;
mod model;
mod supervisor;

use std::sync::atomic::Ordering;
use std::sync::Mutex;

use tauri::{AppHandle, State};

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
/// 2. Connects to the selected STT provider (Deepgram cloud or Moonshine local).
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

    // ── 2. Build the STT provider (+ offline Moonshine fallback) ─────────
    let stt_provider =
        model::build_provider(&app, provider_name, api_key, device_id.as_deref(), gain, pause_silence_ms)?;
    let stt_fallback = model::build_fallback(&app, provider_name, pause_silence_ms);

    stt_active.store(true, Ordering::SeqCst);
    audio_active.store(true, Ordering::SeqCst);

    // ── 3. Prepare the audio channel and spawn the capture/fan-out thread ─
    let (audio_send_tx, audio_send_rx) = crossbeam_channel::bounded::<Vec<i16>>(64);
    audio::spawn_audio_fanout(&app, device_id, gain, &stt_active, &audio_active, audio_send_tx)?;

    // ── 4. Spawn the STT supervisor (provider + cloud↔on-device failover) ─
    let (event_tx, event_rx) = tokio::sync::mpsc::channel::<TranscriptEvent>(64);

    let conn_active = stt_active.clone();
    let provider_log_name = stt_provider.name().to_string();
    let supervisor_app = app.clone();

    // Share the on-device fallback so the supervisor can both run it and stop it
    // (to fail back) from separate tasks.
    let stt_fallback: Option<std::sync::Arc<dyn SttProvider>> =
        stt_fallback.map(std::sync::Arc::from);

    tauri::async_runtime::spawn(supervisor::run_stt_supervisor(
        stt_provider,
        stt_fallback,
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
pub fn stop_transcription(state: State<'_, Mutex<AppState>>) -> Result<(), String> {
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
