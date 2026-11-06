//! Persistent registry of downloaded (installed) Bible translations.
//!
//! The bundled `lumenlive.db` is read-only, so downloaded translations can't be
//! merged into it — each lives in its own `SQLite` file under the app data dir,
//! `ATTACH`ed at runtime (see [`crate::db::BibleDb::attach_translation`]). This
//! registry is the small JSON index that records which files exist and the
//! stable global id each was assigned, so the set survives restarts.
//!
//! The registry stores only what's needed to re-attach and to list installs
//! without opening every file; the attached file itself remains the source of
//! truth for verse data.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::db::FIRST_DOWNLOADED_ID;
use crate::error::BibleError;

/// One installed translation's registry record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledTranslation {
    /// Stable, app-wide id (>= [`FIRST_DOWNLOADED_ID`]). What the frontend and
    /// query router use to address this translation.
    pub global_id: i64,
    /// The `translation_id` inside the standalone file (its local autoincrement).
    pub local_id: i64,
    /// Manifest slug this was installed from, e.g. `"web"`. Unique per install.
    pub resource_id: String,
    pub abbreviation: String,
    pub title: String,
    pub language: String,
    /// License name recorded from the catalog manifest at install time.
    pub license: String,
    pub is_copyrighted: bool,
    /// File name (relative to the bibles dir) of the translation's `SQLite` file.
    pub file_name: String,
    pub schema_version: i64,
}

/// The on-disk registry document.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct InstalledRegistry {
    #[serde(default)]
    pub translations: Vec<InstalledTranslation>,
}

impl InstalledRegistry {
    /// Load the registry from `path`, or return an empty registry if the file
    /// doesn't exist yet (nothing installed).
    pub fn load(path: &Path) -> Result<Self, BibleError> {
        match std::fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes)
                .map_err(|e| BibleError::Internal(format!("parse registry: {e}"))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::default()),
            Err(e) => Err(BibleError::Internal(format!("read registry: {e}"))),
        }
    }

    /// Persist the registry to `path`, creating parent directories as needed.
    pub fn save(&self, path: &Path) -> Result<(), BibleError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| BibleError::Internal(format!("create registry dir: {e}")))?;
        }
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| BibleError::Internal(format!("serialize registry: {e}")))?;
        std::fs::write(path, json).map_err(|e| BibleError::Internal(format!("write registry: {e}")))
    }

    /// The next global id to hand out: one past the current maximum, but never
    /// below [`FIRST_DOWNLOADED_ID`]. Monotonic even after removals, so a freed
    /// id is not reused while its file might still be attached elsewhere.
    pub fn next_global_id(&self) -> i64 {
        self.translations
            .iter()
            .map(|t| t.global_id)
            .max()
            .map_or(FIRST_DOWNLOADED_ID, |m| (m + 1).max(FIRST_DOWNLOADED_ID))
    }

    pub fn find(&self, global_id: i64) -> Option<&InstalledTranslation> {
        self.translations.iter().find(|t| t.global_id == global_id)
    }

    pub fn find_by_resource(&self, resource_id: &str) -> Option<&InstalledTranslation> {
        self.translations
            .iter()
            .find(|t| t.resource_id == resource_id)
    }

    /// Insert an install record, replacing any prior entry with the same global
    /// id or resource id.
    pub fn insert(&mut self, entry: InstalledTranslation) {
        self.translations
            .retain(|t| t.global_id != entry.global_id && t.resource_id != entry.resource_id);
        self.translations.push(entry);
    }

    /// Remove and return the record for `global_id`, if present.
    pub fn remove(&mut self, global_id: i64) -> Option<InstalledTranslation> {
        self.translations
            .iter()
            .position(|t| t.global_id == global_id)
            .map(|pos| self.translations.remove(pos))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn entry(global_id: i64, resource_id: &str) -> InstalledTranslation {
        InstalledTranslation {
            global_id,
            local_id: 1,
            resource_id: resource_id.to_string(),
            abbreviation: resource_id.to_uppercase(),
            title: format!("Title {resource_id}"),
            language: "en".to_string(),
            license: "Public Domain".to_string(),
            is_copyrighted: false,
            file_name: format!("{resource_id}.db"),
            schema_version: 1,
        }
    }

    fn temp_path() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        std::env::temp_dir().join(format!(
            "ll-registry-test-{}-{n}/installed.json",
            std::process::id()
        ))
    }

    #[test]
    fn load_missing_returns_empty() {
        let missing = std::env::temp_dir().join("ll-registry-does-not-exist-xyz.json");
        let reg = InstalledRegistry::load(&missing).unwrap();
        assert!(reg.translations.is_empty());
    }

    #[test]
    fn next_global_id_starts_at_floor() {
        let reg = InstalledRegistry::default();
        assert_eq!(reg.next_global_id(), FIRST_DOWNLOADED_ID);
    }

    #[test]
    fn next_global_id_is_monotonic_past_max() {
        let mut reg = InstalledRegistry::default();
        reg.insert(entry(1000, "web"));
        reg.insert(entry(1005, "asv"));
        assert_eq!(reg.next_global_id(), 1006);
        // Even after removing the max, ids are not reused.
        reg.remove(1005);
        assert_eq!(reg.next_global_id(), 1001);
    }

    #[test]
    fn insert_replaces_same_resource_or_id() {
        let mut reg = InstalledRegistry::default();
        reg.insert(entry(1000, "web"));
        reg.insert(entry(1000, "web")); // same id + resource
        assert_eq!(reg.translations.len(), 1);
    }

    #[test]
    fn find_helpers() {
        let mut reg = InstalledRegistry::default();
        reg.insert(entry(1000, "web"));
        assert!(reg.find(1000).is_some());
        assert!(reg.find_by_resource("web").is_some());
        assert!(reg.find(1234).is_none());
    }

    #[test]
    fn save_then_load_round_trips() {
        let path = temp_path();
        let mut reg = InstalledRegistry::default();
        reg.insert(entry(1000, "web"));
        reg.insert(entry(1001, "asv"));
        reg.save(&path).unwrap();

        let loaded = InstalledRegistry::load(&path).unwrap();
        assert_eq!(loaded.translations, reg.translations);

        // cleanup
        let _ = std::fs::remove_file(&path);
        if let Some(parent) = path.parent() {
            let _ = std::fs::remove_dir(parent);
        }
    }
}
