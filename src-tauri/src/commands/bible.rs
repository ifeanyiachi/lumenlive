#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::sync::Mutex;
use serde::Serialize;
use tauri::State;

use crate::bible_state::BibleState;
use lumenlive_bible::{Book, CrossReference, LexiconEntry, OriginalWord, Translation, Verse};

#[tauri::command]
pub fn list_translations(
    state: State<'_, Mutex<BibleState>>,
) -> Result<Vec<Translation>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.list_translations().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_books(
    state: State<'_, Mutex<BibleState>>,
    translation_id: i64,
) -> Result<Vec<Book>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.list_books(translation_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter(
    state: State<'_, Mutex<BibleState>>,
    translation_id: i64,
    book_number: i32,
    chapter: i32,
) -> Result<Vec<Verse>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_chapter(translation_id, book_number, chapter)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_verse(
    state: State<'_, Mutex<BibleState>>,
    translation_id: i64,
    book_number: i32,
    chapter: i32,
    verse: i32,
) -> Result<Option<Verse>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_verse(translation_id, book_number, chapter, verse)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_verses(
    state: State<'_, Mutex<BibleState>>,
    query: String,
    translation_id: i64,
    limit: usize,
) -> Result<Vec<Verse>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.search_verses(&query, translation_id, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_cross_references(
    state: State<'_, Mutex<BibleState>>,
    book_number: i32,
    chapter: i32,
    verse: i32,
) -> Result<Vec<CrossReference>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_cross_references(book_number, chapter, verse)
        .map_err(|e| e.to_string())
}

/// Get the active translation ID
#[tauri::command]
pub fn get_active_translation(
    state: State<'_, Mutex<BibleState>>,
) -> Result<i64, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    Ok(bible.active_translation_id)
}

/// Set the active translation by ID
#[tauri::command]
pub fn set_active_translation(
    state: State<'_, Mutex<BibleState>>,
    translation_id: i64,
) -> Result<i64, String> {
    let mut bible = state.lock().map_err(|e| e.to_string())?;
    // Verify the translation exists
    if let Some(ref db) = bible.db {
        let translations = db.list_translations().map_err(|e| e.to_string())?;
        if !translations.iter().any(|t| t.id == translation_id) {
            return Err(format!("Translation ID {translation_id} not found"));
        }
    }
    bible.active_translation_id = translation_id;
    log::info!("[BIBLE] Active translation set to ID {translation_id}");
    Ok(translation_id)
}

#[tauri::command]
pub fn get_verse_words(
    state: State<'_, Mutex<BibleState>>,
    book_number: i32,
    chapter: i32,
    verse: i32,
    english_text: Option<String>,
) -> Result<Vec<OriginalWord>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    // With the verse's English text, also align each word to its in-context
    // English word (for the chip); without it, return the plain word list.
    match english_text {
        Some(text) => db.get_aligned_verse_words(book_number, chapter, verse, &text),
        None => db.get_verse_words(book_number, chapter, verse),
    }
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_lexicon_entry(
    state: State<'_, Mutex<BibleState>>,
    strong_number: String,
) -> Result<Option<LexiconEntry>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_lexicon_entry(&strong_number)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_annotated_verse(
    state: State<'_, Mutex<BibleState>>,
    book_number: i32,
    chapter: i32,
    verse: i32,
    english_text: String,
) -> Result<Option<String>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;
    db.get_annotated_verse(book_number, chapter, verse, &english_text)
        .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct VerseSearchRow {
    pub book_number: i32,
    pub book_name: String,
    pub chapter: i32,
    pub verse: i32,
    pub text: String,
}

#[tauri::command]
pub fn get_translation_verses_for_search(
    state: State<'_, Mutex<BibleState>>,
    translation_id: i64,
) -> Result<Vec<VerseSearchRow>, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;

    db.load_translation_verses_for_search(translation_id)
        .map(|rows| {
            rows.into_iter()
                .map(|v| VerseSearchRow {
                    book_number: v.book_number,
                    book_name: v.book_name,
                    chapter: v.chapter,
                    verse: v.verse,
                    text: v.text,
                })
                .collect()
        })
        .map_err(|e| e.to_string())
}
