#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::collections::HashSet;
use std::sync::Mutex;

use serde::Serialize;
use tauri::State;

use lumenlive_bible::{BibleDb, Verse};
use lumenlive_detection::{DetectionPipeline, MergedDetection, ReadingMode};

use crate::bible_state::BibleState;

/// Confidence assigned to the best FTS5 BM25 match (rank 0) in context search.
pub(crate) const FTS5_RANK0_CONFIDENCE: f64 = 0.75;

/// Confidence decrease per FTS5 rank position.
pub(crate) const FTS5_CONFIDENCE_DECAY: f64 = 0.04;

/// FTS5 results below this confidence are not included.
pub(crate) const FTS5_MIN_CONFIDENCE: f64 = 0.50;

/// Serializable detection result for the frontend
#[derive(Clone, Serialize)]
pub struct DetectionResult {
    pub verse_ref: String,
    pub verse_text: String,
    pub book_name: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub confidence: f64,
    pub source: String,
    pub auto_queued: bool,
    pub transcript_snippet: String,
    /// True when detected from a chapter-only reference (verse defaults to 1, may be refined).
    pub is_chapter_only: bool,
    /// True when this is a low-trust NARRATIVE mention: a book name spoken in
    /// prose (no citation cue) while Reading Mode is actively tracking a
    /// *different* book — e.g. "Obadiah" named as a character during a reading
    /// of 1 Kings 18 (aitrans Phase 3). Such hits must NOT auto-display; they
    /// still surface in the AI Detections panel/queue for a deliberate send.
    /// Computed by the live direct worker; defaults false everywhere else.
    #[serde(default)]
    pub narrative_mention: bool,
}

fn source_to_string(source: &lumenlive_detection::DetectionSource) -> String {
    match source {
        lumenlive_detection::DetectionSource::DirectReference => "direct".to_string(),
        lumenlive_detection::DetectionSource::Semantic { .. } => "semantic".to_string(),
    }
}

/// Semantic hits are matched against the KJV meaning-index, so `matched` is a
/// KJV verse. Show it in the *active* translation instead when that translation
/// carries the verse — the reference is translation-independent, so a phrase or
/// paraphrase found via KJV embeddings displays in e.g. BSB. Falls back to the
/// matched verse when the active translation *is* KJV or lacks that verse (a
/// versification gap), so a hit is never dropped.
fn display_in_active(db: &BibleDb, active_id: i64, matched: Verse) -> Verse {
    if active_id == matched.translation_id {
        return matched;
    }
    match db.get_verse(active_id, matched.book_number, matched.chapter, matched.verse) {
        Ok(Some(active)) => active,
        _ => matched,
    }
}

/// True when a `VerseRef` names a concrete book+chapter+verse — the case the
/// Bible DB can answer an existence question for. Chapter-only holds and
/// book-only refs (verse/chapter defaulted to 0) are not concrete and are never
/// suppressed by [`to_result`].
fn is_full_reference(vr: &lumenlive_detection::VerseRef) -> bool {
    vr.book_number > 0 && vr.chapter > 0 && vr.verse_start > 0
}

/// Resolve a detection to a full verse result using the database.
///
/// Resolution order:
/// 1. By `verse_id` (semantic detections with DB primary key)
/// 2. By `book_number/chapter/verse_start` with active translation (direct + FTS5 detections)
/// 3. Fallback to unresolved `VerseRef` fields (no DB available)
///
/// Returns `None` to **suppress** a detection that cites a concrete verse the
/// loaded Bible has no text for — a misheard or self-corrected reference like
/// "Revelation 20:22" (Revelation 20 ends at verse 15). Preachers routinely
/// misspeak a chapter:verse and correct themselves ("20:22 — sorry, 22:20"); the
/// impossible first reading must never reach the program screen. Before this the
/// unresolved ref was emitted with empty verse text, projecting a blank verse.
/// Suppression is gated on a DB actually being loaded — without one we cannot
/// verify existence, so the unresolved fallback is preserved. A verse absent
/// only from the *active* translation (a versification gap) is also suppressed:
/// there is no text to display in that translation regardless of the reason.
pub fn to_result(bible: &BibleState, merged: &MergedDetection) -> Option<DetectionResult> {
    let vr = &merged.detection.verse_ref;
    let vid = merged.detection.verse_id;

    let resolved = bible.db.as_ref().and_then(|db| {
        // Try verse_id first (vector-based semantic detections). The id points
        // at the KJV meaning-index; render the hit in the active translation.
        if let Some(id) = vid {
            if let Ok(Some(v)) = db.get_verse_by_id(id) {
                return Some(display_in_active(db, bible.active_translation_id, v));
            }
        }
        // Fall back to book/chapter/verse lookup (direct + FTS5 detections)
        if is_full_reference(vr) {
            if let Ok(Some(v)) = db.get_verse(bible.active_translation_id, vr.book_number, vr.chapter, vr.verse_start) {
                return Some(v);
            }
        }
        None
    });

    // Suppress an unresolvable concrete citation (nonexistent verse) when a DB
    // is present to prove it doesn't exist. See the fn doc.
    if resolved.is_none() && bible.db.is_some() && is_full_reference(vr) {
        log::info!(
            "[DET] Suppressed nonexistent verse: {} {}:{}",
            vr.book_name, vr.chapter, vr.verse_start
        );
        return None;
    }

    let (reference, verse_text, book_name, book_number, chapter, verse) = if let Some(v) = resolved {
        let r = format!("{} {}:{}", v.book_name, v.chapter, v.verse);
        (r, v.text, v.book_name, v.book_number, v.chapter, v.verse)
    } else {
        let r = format!("{} {}:{}", vr.book_name, vr.chapter, vr.verse_start);
        (r, String::new(), vr.book_name.clone(), vr.book_number, vr.chapter, vr.verse_start)
    };

    Some(DetectionResult {
        verse_ref: reference,
        verse_text,
        book_name,
        book_number,
        chapter,
        verse,
        confidence: merged.detection.confidence,
        source: source_to_string(&merged.detection.source),
        auto_queued: merged.auto_queued,
        transcript_snippet: merged.detection.transcript_snippet.clone(),
        is_chapter_only: merged.detection.is_chapter_only,
        // Narrative classification needs Reading-Mode context the shared resolver
        // does not have; the live direct worker stamps it after this call. Every
        // other path (on-demand `detect_verses`, semantic) leaves it false.
        narrative_mention: false,
    })
}

/// Run the detection pipeline on a piece of transcript text
#[tauri::command]
pub fn detect_verses(
    state: State<'_, Mutex<BibleState>>,
    pipeline_state: State<'_, Mutex<DetectionPipeline>>,
    merger_state: State<'_, Mutex<lumenlive_detection::DetectionMerger>>,
    text: String,
) -> Result<Vec<DetectionResult>, String> {
    let merged = {
        // Merge through the shared merger so this on-demand path honours the
        // same cooldown/thresholds as the live direct + semantic workers.
        let mut pipeline = pipeline_state.lock().map_err(|e| e.to_string())?;
        let mut merger = merger_state.lock().map_err(|e| e.to_string())?;
        pipeline.process(&text, &mut merger)
    };
    let bible = state.lock().map_err(|e| e.to_string())?;
    let results: Vec<DetectionResult> = merged.iter().filter_map(|m| to_result(&bible, m)).collect();
    Ok(results)
}

/// Check if semantic search is available
#[tauri::command]
pub fn detection_status(
    pipeline_state: State<'_, Mutex<DetectionPipeline>>,
) -> Result<DetectionStatusResult, String> {
    let pipeline = pipeline_state.lock().map_err(|e| e.to_string())?;
    Ok(DetectionStatusResult {
        has_direct: true,
        has_semantic: pipeline.has_semantic(),
        paraphrase_enabled: pipeline.use_synonyms(),
    })
}

/// Toggle paraphrase detection (synonym expansion) on/off
#[tauri::command]
pub fn toggle_paraphrase_detection(
    pipeline_state: State<'_, Mutex<DetectionPipeline>>,
    enabled: bool,
) -> Result<bool, String> {
    let mut pipeline = pipeline_state.lock().map_err(|e| e.to_string())?;
    pipeline.set_use_synonyms(enabled);
    log::info!("[DET] Paraphrase detection (synonyms) set to: {enabled}");
    Ok(enabled)
}

#[derive(Serialize)]
pub struct DetectionStatusResult {
    pub has_direct: bool,
    pub has_semantic: bool,
    pub paraphrase_enabled: bool,
}

#[derive(Serialize)]
pub struct SemanticSearchResult {
    pub verse_ref: String,
    pub verse_text: String,
    pub book_name: String,
    pub book_number: i32,
    pub chapter: i32,
    pub verse: i32,
    pub similarity: f64,
}

#[tauri::command]
pub fn semantic_search(
    state: State<'_, Mutex<BibleState>>,
    pipeline_state: State<'_, Mutex<DetectionPipeline>>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<SemanticSearchResult>, String> {
    let k = limit.unwrap_or(10);
    let t_all = std::time::Instant::now();

    // Lock pipeline for vector search (may be slow if ONNX runs). The ONNX
    // query-embedding (~300-600ms) dominates end-to-end latency, so time it
    // apart from the DB work below — the log then attributes the cost to the
    // right stage instead of lumping it into one number.
    let t_vec = std::time::Instant::now();
    let vector_results = {
        let mut pipeline = pipeline_state.lock().map_err(|e| e.to_string())?;
        if !pipeline.has_semantic() {
            return Err("Semantic search not available — model or embeddings not loaded".into());
        }
        pipeline.semantic_search(&query, k)
    }; // Pipeline lock dropped
    let vec_elapsed = t_vec.elapsed();

    // Lock the Bible DB for lookups only (fast: verse resolution + FTS5 BM25)
    let t_db = std::time::Instant::now();
    let bible = state.lock().map_err(|e| e.to_string())?;

    let mut results: Vec<SemanticSearchResult> = vector_results
        .into_iter()
        .filter_map(|(verse_id, similarity)| {
            if let Some(ref db) = bible.db {
                if let Ok(Some(v)) = db.get_verse_by_id(verse_id) {
                    // Vector index is KJV; show the match in the active translation.
                    let v = display_in_active(db, bible.active_translation_id, v);
                    return Some(SemanticSearchResult {
                        verse_ref: format!("{} {}:{}", v.book_name, v.chapter, v.verse),
                        verse_text: v.text,
                        book_name: v.book_name,
                        book_number: v.book_number,
                        chapter: v.chapter,
                        verse: v.verse,
                        similarity,
                    });
                }
            }
            None
        })
        .collect();

    // FTS5 BM25 across all English translations — resolve to active translation
    if let Some(ref db) = bible.db {
        let fts_results = db.search_verses_bm25(&query, k).unwrap_or_default();
        let seen: HashSet<(i32, i32, i32)> = results
            .iter()
            .map(|r| (r.book_number, r.chapter, r.verse))
            .collect();

        for (rank, fts) in fts_results.iter().enumerate() {
            if !seen.contains(&(fts.book_number, fts.chapter, fts.verse)) {
                #[expect(clippy::cast_precision_loss, reason = "rank is small")]
                let similarity = FTS5_RANK0_CONFIDENCE - (rank as f64 * FTS5_CONFIDENCE_DECAY);
                if similarity < FTS5_MIN_CONFIDENCE {
                    break;
                }
                // Resolve to active translation text
                if let Ok(Some(v)) = db.get_verse(
                    bible.active_translation_id,
                    fts.book_number,
                    fts.chapter,
                    fts.verse,
                ) {
                    results.push(SemanticSearchResult {
                        verse_ref: format!("{} {}:{}", v.book_name, v.chapter, v.verse),
                        verse_text: v.text,
                        book_name: v.book_name,
                        book_number: v.book_number,
                        chapter: v.chapter,
                        verse: v.verse,
                        similarity,
                    });
                }
            }
        }
    }

    // Ensure highest similarity is always first
    results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap_or(std::cmp::Ordering::Equal));

    log::info!(
        "[SEARCH-SEMANTIC] total={:?} (vector+embed={:?}, db+fts={:?}) query_len={} hits={}",
        t_all.elapsed(),
        vec_elapsed,
        t_db.elapsed(),
        query.len(),
        results.len()
    );

    Ok(results)
}

/// Get reading mode status
#[tauri::command]
pub fn reading_mode_status(
    state: State<'_, Mutex<ReadingMode>>,
) -> Result<ReadingModeStatus, String> {
    let rm = state.lock().map_err(|e| e.to_string())?;
    Ok(ReadingModeStatus {
        active: rm.is_active(),
        current_verse: rm.current_verse(),
    })
}

#[derive(Serialize)]
pub struct ReadingModeStatus {
    pub active: bool,
    pub current_verse: Option<i32>,
}

/// Stop reading mode
#[tauri::command]
pub fn stop_reading_mode(
    state: State<'_, Mutex<ReadingMode>>,
) -> Result<(), String> {
    let mut rm = state.lock().map_err(|e| e.to_string())?;
    rm.deactivate();
    Ok(())
}

/// Sync detection settings from the frontend to the shared backend merger.
///
/// This is the single merger used by every detection path — the live direct and
/// semantic workers and the `detect_verses` command — so a threshold/cooldown
/// change here applies uniformly.
#[tauri::command]
pub fn update_detection_settings(
    merger_state: State<'_, Mutex<lumenlive_detection::DetectionMerger>>,
    confidence_threshold: Option<f64>,
    cooldown_ms: Option<u64>,
) -> Result<(), String> {
    let mut merger = merger_state.lock().map_err(|e| e.to_string())?;
    if let Some(t) = confidence_threshold {
        merger.set_auto_queue_threshold(t);
        log::info!("[DET] Auto-queue threshold set to {t:.2}");
    }
    if let Some(ms) = cooldown_ms {
        merger.set_cooldown_ms(ms);
        log::info!("[DET] Cooldown set to {ms}ms");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_full_reference;
    use lumenlive_detection::VerseRef;

    fn vr(book: i32, chapter: i32, verse: i32) -> VerseRef {
        VerseRef {
            book_number: book,
            book_name: "Revelation".to_string(),
            chapter,
            verse_start: verse,
            verse_end: None,
        }
    }

    #[test]
    fn full_reference_is_concrete() {
        // Revelation 20:22 — a fully-specified citation. Only these are eligible
        // for existence-suppression; whether it *exists* is the DB's call.
        assert!(is_full_reference(&vr(66, 20, 22)));
        assert!(is_full_reference(&vr(43, 3, 16)));
    }

    #[test]
    fn partial_references_are_not_concrete() {
        // Chapter-only holds (verse 0) and book-only refs (chapter 0) must never
        // be suppressed as "nonexistent" — they are incomplete, not impossible.
        assert!(!is_full_reference(&vr(66, 20, 0))); // chapter-only
        assert!(!is_full_reference(&vr(66, 0, 0))); // book-only
        assert!(!is_full_reference(&vr(0, 20, 22))); // no book resolved
    }
}
