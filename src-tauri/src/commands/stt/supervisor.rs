//! STT engine supervision for one transcription session: runs the Deepgram
//! provider and surfaces an unexpected disconnect/failure to the UI.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use lumenlive_stt::{SttError, SttProvider, TranscriptEvent};

use crate::events::EVENT_STT_UNAUTHORIZED;

/// Supervise the STT engine for one transcription session.
///
/// Runs `primary` until the user stops it (`active` cleared) or the provider
/// returns. A return while `active` is still set means the connection dropped or
/// the provider errored — surface it as `stt_error` so the operator sees the
/// live session went dark rather than a silently frozen transcript.
pub(super) async fn run_stt_supervisor(
    primary: Arc<dyn SttProvider>,
    audio_rx: crossbeam_channel::Receiver<Vec<i16>>,
    event_tx: tokio::sync::mpsc::Sender<TranscriptEvent>,
    active: Arc<AtomicBool>,
    app: AppHandle,
    primary_name: String,
) {
    let result = primary.start(audio_rx, event_tx).await;

    // A user stop (active cleared) is a clean shutdown; anything else is a real
    // failure — the network dropped or the provider errored.
    if active.load(Ordering::SeqCst) {
        match result {
            Ok(()) => {
                log::warn!("[STT-{primary_name}] provider disconnected");
                let _ = app.emit("stt_error", "Transcription connection lost.");
            }
            Err(SttError::Unauthorized) => {
                // The key was rejected. Emit a distinct event so the frontend can
                // flag a BYO key as invalid (and tell the backend) rather than
                // showing a generic "connection lost" toast.
                log::error!("[STT-{primary_name}] API key rejected (401)");
                let _ = app.emit(EVENT_STT_UNAUTHORIZED, ());
            }
            Err(e) => {
                log::error!("[STT-{primary_name}] provider failed: {e:?}");
                let _ = app.emit("stt_error", format!("Transcription stopped: {e}"));
            }
        }
    }

    active.store(false, Ordering::SeqCst);
    log::info!("[STT-{primary_name}] supervisor exited");
}
