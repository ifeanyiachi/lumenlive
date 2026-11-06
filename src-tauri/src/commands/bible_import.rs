//! Import a user-supplied Bible as a custom translation.
//!
//! The heavy lifting (building the standalone `.db`, reading a foreign `SQLite`
//! Bible) lives in `lumenlive_bible::import`; these commands only orchestrate:
//! resolve the target file, build it, then attach + register it through the
//! shared [`resource_store::attach_and_register`] so the import becomes a
//! first-class translation (global id >= 1000) that survives restarts exactly
//! like a downloaded one.
//!
//! Two entry points mirror the two producers:
//!  - [`import_bible_verses`]: text formats (txt/csv/.bib) parsed in the webview
//!    into a verse array (see `src/lib/bible-import`).
//!  - [`import_bible_sqlite`]: a foreign `.db`/`.sqlite`/`.bblx`, read in Rust.

#![expect(
    clippy::needless_pass_by_value,
    reason = "Tauri command extractors require pass-by-value"
)]

use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::bible_state::BibleState;
use crate::commands::resource_store::{attach_and_register, bibles_dir, sanitize, REGISTRY_FILE};
use lumenlive_bible::{
    build_translation_db, extract_sqlite_verses, ImportMeta, ImportStats, ImportVerse,
    InstalledRegistry,
};

/// Schema version recorded for imported translations. They use the same
/// standalone shape as downloads, so they share the download schema version.
const IMPORT_SCHEMA_VERSION: i64 = 1;

/// Returned to the frontend after a successful import: enough to refresh the
/// translation picker, plus the counts to show the user what landed.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub global_id: i64,
    pub abbreviation: String,
    pub title: String,
    pub language: String,
    pub verse_count: usize,
    pub book_count: usize,
    pub skipped: usize,
}

/// Import verses parsed client-side (txt/csv/.bib) into a new translation.
#[tauri::command]
pub fn import_bible_verses(
    app: AppHandle,
    state: State<'_, Mutex<BibleState>>,
    metadata: ImportMeta,
    verses: Vec<ImportVerse>,
) -> Result<ImportResult, String> {
    finish_import(&app, &state, &metadata, &verses)
}

/// Import a foreign `SQLite` Bible file (read + parsed in Rust) into a new
/// translation. `source_path` is an absolute path chosen via the file dialog.
#[tauri::command]
pub fn import_bible_sqlite(
    app: AppHandle,
    state: State<'_, Mutex<BibleState>>,
    metadata: ImportMeta,
    source_path: String,
) -> Result<ImportResult, String> {
    let verses = extract_sqlite_verses(Path::new(&source_path)).map_err(|e| e.to_string())?;
    finish_import(&app, &state, &metadata, &verses)
}

/// Shared tail: validate metadata, build the standalone DB, attach + register.
fn finish_import(
    app: &AppHandle,
    state: &State<'_, Mutex<BibleState>>,
    metadata: &ImportMeta,
    verses: &[ImportVerse],
) -> Result<ImportResult, String> {
    let abbrev = metadata.abbreviation.trim();
    if abbrev.is_empty() {
        return Err("A translation code (abbreviation) is required.".to_string());
    }

    let dir = bibles_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create bibles dir: {e}"))?;
    let registry_path = dir.join(REGISTRY_FILE);

    // One import per abbreviation. Re-check happens under the lock in
    // attach_and_register too; this is the friendly early-out.
    let resource_id = format!("import-{}", sanitize(&abbrev.to_lowercase()));
    if InstalledRegistry::load(&registry_path)
        .map_err(|e| e.to_string())?
        .find_by_resource(&resource_id)
        .is_some()
    {
        return Err(format!(
            "'{abbrev}' is already imported. Remove it first to re-import."
        ));
    }

    let file_name = format!("{}.db", sanitize(&resource_id));
    let final_path = dir.join(&file_name);

    let import_stats: ImportStats =
        build_translation_db(&final_path, metadata, verses).map_err(|e| e.to_string())?;

    let outcome = attach_and_register(
        state,
        &registry_path,
        &final_path,
        &file_name,
        &resource_id,
        &metadata.license,
        IMPORT_SCHEMA_VERSION,
    );

    match outcome {
        Ok(info) => Ok(ImportResult {
            global_id: info.global_id,
            abbreviation: info.abbreviation,
            title: info.title,
            language: info.language,
            verse_count: import_stats.verse_count,
            book_count: import_stats.book_count,
            skipped: import_stats.skipped,
        }),
        Err(e) => {
            // Roll the file back so a failed import leaves no orphan on disk.
            let _ = std::fs::remove_file(&final_path);
            Err(e)
        }
    }
}
