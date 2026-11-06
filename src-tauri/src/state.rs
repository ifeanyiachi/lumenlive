use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// Transcription-lifecycle state. The Bible database and active translation
/// live in [`crate::bible_state::BibleState`] behind their own lock so that
/// hot-path verse resolution never contends with this state.
pub struct AppState {
    pub audio_active: Arc<AtomicBool>,
    pub stt_active: Arc<AtomicBool>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            audio_active: Arc::new(AtomicBool::new(false)),
            stt_active: Arc::new(AtomicBool::new(false)),
        }
    }
}
