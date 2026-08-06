use lumenlive_bible::BibleDb;

/// Owns the Bible database connection and the active translation together,
/// behind their own lock — deliberately separate from [`crate::state::AppState`]'s
/// transcription-lifecycle atomics.
///
/// Verse-text resolution runs on the detection hot path (both the direct and
/// semantic workers), so keeping the DB out of the general `AppState` mutex
/// means those lookups never contend with lifecycle state or any future
/// `AppState` growth. The DB and the active translation id live together
/// because every resolution needs both (`get_verse(active_translation_id, …)`).
pub struct BibleState {
    pub db: Option<BibleDb>,
    pub active_translation_id: i64,
}

impl BibleState {
    pub fn new() -> Self {
        Self {
            db: None,
            active_translation_id: 1, // Default to first translation (KJV)
        }
    }
}

impl Default for BibleState {
    fn default() -> Self {
        Self::new()
    }
}
