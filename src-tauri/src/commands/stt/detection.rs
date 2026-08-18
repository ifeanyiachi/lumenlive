//! Live verse detection off the transcript stream: instant direct (pattern)
//! detection, hybrid semantic (vector + FTS5) detection, reading-mode tracking,
//! and voice translation commands. These run inside `spawn_blocking` workers so
//! their mutex locks / ONNX / DB I/O never touch the async runtime.
//!
//! NOTE: this is the *live* path. The on-demand batch equivalent lives in
//! `crate::commands::detection` (`detect_verses`); the two are intentionally kept
//! separate (see refactorcode.md R1). Only the shared verse-resolution helpers
//! (`to_result`, `DetectionResult`) are reused from there.
//!
//! ## Lock ordering (R2)
//! The detector states are kept under **separate** mutexes on purpose: direct
//! detection locks only `DirectDetector`/`DetectionMerger` so it never blocks on
//! the semantic worker's ONNX under `DetectionPipeline`. When two locks must be
//! held together (only reading mode does this), the order is **`ReadingMode` →
//! `BibleState`**, never the reverse — `run_direct_detection` takes `BibleState`
//! alone, so no `bible → rm` path exists to deadlock against. Reading-mode
//! decide→read→act runs inside a single `ReadingMode` critical section so the UI's
//! `stop_reading_mode` can't interleave between the decision and the start.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::bible_state::BibleState;

use super::truncate_safe;

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

/// Run direct (regex/pattern) detection only. Instant, no ONNX.
/// Locks its own `Mutex<DirectDetector>` (so it never blocks on the semantic
/// worker's ONNX under the pipeline lock) but merges through the SHARED
/// `Mutex<DetectionMerger>` — the same instance the semantic worker uses — so
/// the anti-flood cooldown coordinates across both channels.
/// Returns true if high-confidence results were found (>= 0.90).
///
/// `is_final` splits two paths:
/// - **partial** (`false`): a spoken reference detected mid-utterance. Resolves
///   verse text and emits `verse_detections_partial` for the AI Detections
///   panel ONLY. It deliberately **bypasses the merger** so a volatile partial
///   does not (a) arm the anti-flood cooldown — which would suppress the final's
///   auto-queue — nor (b) drive auto-display to the live audience, which would
///   flicker if the partial is later revised. This is the "verse shows up
///   seconds sooner" win with no live/queue side effects.
/// - **final** (`true`): the full pipeline — merge (auto-queue + cooldown) and
///   emit `verse_detections`, byte-identical to the pre-partials behaviour.
#[expect(clippy::similar_names, reason = "merger and merged are naturally named")]
pub(super) fn run_direct_detection(app: &AppHandle, transcript: &str, is_final: bool) -> bool {
    use lumenlive_detection::{DirectDetector, DetectionMerger, MergedDetection};

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

    // Partial path: panel-only display, merger bypassed (see fn doc). Wrap each
    // raw detection as a non-auto-queued MergedDetection purely so the existing
    // `to_result` verse-resolver can be reused, then emit on the partial event.
    if !is_final {
        let bible_managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(bible) = bible_managed.lock() else {
            log::error!("[DET-DIRECT] BibleState lock poisoned (partial)");
            return has_high_confidence;
        };
        let results: Vec<crate::commands::detection::DetectionResult> = direct_results
            .into_iter()
            .map(|d| {
                crate::commands::detection::to_result(
                    &bible,
                    &MergedDetection { detection: d, auto_queued: false },
                )
            })
            .collect();
        drop(bible);
        if !results.is_empty() {
            let _ = app.emit("verse_detections_partial", &results);
            log::debug!(
                "[DET-DIRECT] partial emitted {} in {:?}",
                results.len(),
                t0.elapsed()
            );
        }
        return has_high_confidence;
    }

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
    let results: Vec<crate::commands::detection::DetectionResult> = merged
        .iter()
        .map(|m| crate::commands::detection::to_result(&bible, m))
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

/// Minimum quotation likelihood before the semantic path emits an early keyword
/// *preview* to the AI Detections panel (see [`emit_semantic_preview`]). Set so
/// the preview fires on a KJV-register quote (a single archaic marker already
/// scores 0.5) or any citation cue ("it is written" = 1.0, "turn to" = 0.7), but
/// stays silent on ordinary preaching (which scores < 0.2). Gating here is what
/// keeps the preview from surfacing a rotating keyword guess every utterance.
const SEMANTIC_PREVIEW_MIN_QUOTATION: f64 = 0.5;

/// How many FTS5 candidates the preview considers. The top keyword hit is the
/// quoted verse in the common case; the floor ([`FTS_ONLY_FLOOR`]) trims the tail.
const SEMANTIC_PREVIEW_FTS_K: usize = 5;

/// Optimistic keyword preview for the AI Detections panel. When an utterance
/// *looks like a scripture quotation* (archaic register or a citation cue), run
/// the fast FTS5 keyword recall (~1-3ms) and surface the top candidate(s)
/// immediately — seconds before the ONNX vector search (~300-600ms) finishes and
/// the authoritative `verse_detections` emit lands. This is the semantic-path
/// analogue of the direct partial preview: the quoted verse shows up as soon as
/// the words are recognised, not after the embedding round-trip.
///
/// Panel-only and purely additive — it emits on `verse_detections_partial`,
/// bypasses the merger (no cooldown armed, no auto-queue, never driven to live),
/// and leaves the final semantic path byte-identical. If the ONNX pass later
/// disagrees, the stale preview simply ages out of the recency-capped panel; it
/// can never mis-queue or flicker the audience screen.
///
/// Gated on the quotation signal ([`SEMANTIC_PREVIEW_MIN_QUOTATION`]) so it stays
/// quiet during ordinary preaching, which would otherwise show a keyword guess on
/// every fragment (BM25 always returns *something*).
fn emit_semantic_preview(app: &AppHandle, transcript: &str) {
    use lumenlive_detection::{
        quotation, Detection, DetectionSource, MergedDetection, VerseRef,
    };
    use std::time::{SystemTime, UNIX_EPOCH};

    // Transcript-only quotation likelihood (no candidate verse text yet). Gate
    // early so a non-quotation utterance costs nothing but this string scan.
    let q = quotation::quotation_score(transcript, None);
    if q < SEMANTIC_PREVIEW_MIN_QUOTATION {
        return;
    }

    let managed: State<'_, Mutex<BibleState>> = app.state();
    let Ok(bible) = managed.lock() else {
        return;
    };
    if bible.db.is_none() {
        return;
    }
    let fts_hits = match bible.db.as_ref().map(|db| db.search_verses_bm25(transcript, SEMANTIC_PREVIEW_FTS_K)) {
        Some(Ok(r)) => r,
        Some(Err(e)) => {
            log::error!("[DET-SEMANTIC] preview FTS5 query failed: {e}");
            return;
        }
        None => return,
    };
    if fts_hits.is_empty() {
        return;
    }

    #[expect(clippy::cast_possible_truncation, reason = "timestamp millis won't exceed u64")]
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let snippet = truncate_safe(transcript, 100).to_string();

    let results: Vec<crate::commands::detection::DetectionResult> = fts_hits
        .iter()
        .enumerate()
        .filter_map(|(rank, f)| {
            #[expect(clippy::cast_precision_loss, reason = "rank is small")]
            let base = FTS_ONLY_BASE - rank as f64 * FTS_ONLY_DECAY;
            if base < FTS_ONLY_FLOOR {
                return None;
            }
            // Lift by quotation likelihood, mirroring the final fusion path so a
            // preview card's confidence matches what the authoritative emit will
            // land at (the panel dedups by verse_ref, so an agreeing final simply
            // upgrades the card in place rather than duplicating it).
            let confidence = quotation::adjust_confidence(base, q);
            let det = Detection {
                verse_ref: VerseRef {
                    book_number: f.book_number,
                    book_name: f.book_name.clone(),
                    chapter: f.chapter,
                    verse_start: f.verse,
                    verse_end: None,
                },
                verse_id: None,
                confidence,
                source: DetectionSource::Semantic { similarity: confidence },
                transcript_snippet: snippet.clone(),
                detected_at: now,
                is_chapter_only: false,
            };
            Some(crate::commands::detection::to_result(
                &bible,
                &MergedDetection { detection: det, auto_queued: false },
            ))
        })
        .collect();
    drop(bible);

    if !results.is_empty() {
        let _ = app.emit("verse_detections_partial", &results);
        log::debug!(
            "[DET-SEMANTIC] preview emitted {} FTS candidate(s) (quotation={q:.2})",
            results.len()
        );
    }
}

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
pub(super) fn run_semantic_detection(app: &AppHandle, transcript: &str) {
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

    // 0. Optimistic keyword preview: if this utterance looks like a quotation,
    //    surface the top FTS candidate(s) in the panel NOW, before the ONNX embed
    //    below adds its ~300-600ms. Panel-only + merger-bypassing (see fn doc);
    //    the authoritative emit further down is unchanged.
    emit_semantic_preview(app, transcript);

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
                // Lift by quotation likelihood: genuine quotations are boosted so
                // they rank higher and auto-queue more readily, while preaching
                // that merely alludes to a verse keeps its raw score (never
                // penalized) so it still surfaces on its own merit. Vector hits
                // contribute verbatim overlap via `a.text`; FTS-only hits fall
                // back to transcript archaic-register + cues.
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
    let results: Vec<crate::commands::detection::DetectionResult> = {
        let managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(bible) = managed.lock() else {
            log::error!("[DET-SEMANTIC] Failed to lock BibleState for verse resolution");
            return;
        };
        merged.iter().map(|m| crate::commands::detection::to_result(&bible, m)).collect()
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
///
/// Split into three sequential steps (start / chapter-nav / advance) that run in
/// order; each preserves the original single-flow control exactly.
pub(super) fn check_reading_mode(app: &AppHandle, transcript: &str, direct_found: bool) -> bool {
    // Step 1: a fresh explicit reference may start/restart reading mode. Only
    // aborts (Some(false)) on a poisoned BibleState lock.
    if let Some(early) = maybe_start_reading_mode(app, transcript, direct_found) {
        return early;
    }

    // Step 2: an explicit "go to chapter N" command. Some(_) = handled/errored.
    if let Some(result) = handle_chapter_nav(app, transcript) {
        return result;
    }

    // Step 3: natural verse advancement within the tracked chapter.
    handle_advance(app, transcript)
}

/// Step 1 of [`check_reading_mode`]: if direct detection found a verse, consider
/// starting/restarting reading mode. Returns `Some(false)` only when a Bible DB
/// lock is poisoned (the original aborted the whole flow with `false`); `None`
/// means "continue to the next step".
fn maybe_start_reading_mode(
    app: &AppHandle,
    transcript: &str,
    direct_found: bool,
) -> Option<bool> {
    use lumenlive_detection::ReadingMode;

    // If direct detection found a verse, consider starting/restarting reading mode.
    // BUT: if reading mode is already active on a book/chapter, do NOT restart
    // on a different book — false positives from bare numbers (e.g., "verse 5"
    // getting matched as "Job 3:5") would hijack the reading session.
    if !direct_found {
        return None;
    }

    let verse_info = {
        let detector_state: State<'_, Mutex<lumenlive_detection::DirectDetector>> = app.state();
        let Ok(detector) = detector_state.lock() else { return None };
        detector.recent_detections().front().cloned()
    };

    let recent = verse_info?;

    // Get the confidence of the detection to distinguish explicit refs from false positives
    let detection_confidence = {
        let detector_state: State<'_, Mutex<lumenlive_detection::DirectDetector>> = app.state();
        detector_state.lock().ok()
            .and_then(|d| d.recent_detections().front().map(|_| DIRECT_DETECTION_CONFIDENCE))
            .unwrap_or(0.0)
    };

    // ── Single ReadingMode critical section (fixes R2 TOCTOU) ──────────────
    // Decide (should_start), then — WITHOUT releasing rm — read the chapter from
    // the Bible DB and act (rm.start). Holding rm across decide→read→act closes
    // the race where the operator's `stop_reading_mode` could deactivate between
    // the decision and the start. Lock order is rm → bible (never the reverse).
    let rm_managed: &Mutex<ReadingMode> = app.state::<Mutex<ReadingMode>>().inner();
    let Ok(mut rm) = rm_managed.lock() else { return None };

    let should_start = if !rm.is_active() && !rm.has_verses() {
        true // Not active, no verses loaded — start fresh
    } else if !rm.is_active() && rm.has_verses() {
        // Paused — restart on any new explicit reference
        true
    } else if rm.current_book() == recent.book_number && rm.current_chapter() == recent.chapter {
        false // Same book+chapter — already tracking this
    } else if rm.current_book() != recent.book_number
        && detection_confidence >= HIGH_CONFIDENCE_THRESHOLD
    {
        // Different book with high confidence — explicit new reference
        // (e.g., "John 1:1" after reading Exodus). Restart.
        true
    } else if rm.current_book() == recent.book_number {
        // Same book, different chapter — natural progression
        true
    } else {
        // Different book, low confidence — likely false positive
        false
    };

    if should_start {
        let chapter_data = {
            let t_db = std::time::Instant::now();
            let bible_managed: State<'_, Mutex<BibleState>> = app.state();
            // Blocking lock is OK — we're inside spawn_blocking, not on the async runtime.
            let Ok(bible) = bible_managed.lock() else {
                log::error!("[READING] BibleState lock poisoned");
                return Some(false);
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

    None
}

/// Step 2 of [`check_reading_mode`]: handle an explicit chapter-navigation
/// command (e.g. "let's go to chapter seven"). `Some(true)` = handled + emitted;
/// `Some(false)` = a lock error aborted the flow; `None` = no command, continue.
fn handle_chapter_nav(app: &AppHandle, transcript: &str) -> Option<bool> {
    use lumenlive_detection::ReadingMode;

    // Single ReadingMode critical section (fixes R2 TOCTOU): decide the chapter
    // change, read the chapter from the Bible DB, and act (rm.start) all while
    // holding rm — so `stop_reading_mode` can't interleave between decide and
    // act. rm is released (drop) before the emit. Lock order rm → bible.
    let rm_managed: &Mutex<ReadingMode> = app.state::<Mutex<ReadingMode>>().inner();
    let Ok(mut rm) = rm_managed.lock() else { return Some(false) };

    let chapter_change = if !rm.is_active() && !rm.has_verses() {
        None
    } else {
        log::info!("[READING] Checking chapter command for: {transcript:?}");
        rm.check_chapter_command(transcript)
    };

    let change = chapter_change?;

    let chapter_data = {
        let t_db = std::time::Instant::now();
        let bible_managed: State<'_, Mutex<BibleState>> = app.state();
        // Blocking lock is OK — we're inside spawn_blocking, not on the async runtime.
        let Ok(bible) = bible_managed.lock() else {
            log::error!("[READING] BibleState lock poisoned (chapter nav)");
            return Some(false);
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

            rm.start(
                change.book_number,
                &change.book_name,
                change.new_chapter,
                start_verse,
                verses,
            );
            drop(rm); // release before emitting (IPC), matching the original

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

            return Some(true);
        }
    }

    None
}

/// Step 3 of [`check_reading_mode`]: natural verse advancement within the
/// tracked chapter. Allowed even when paused (`has_verses` but `!active`) so a
/// "verse N" command can re-activate reading mode after a timeout. Returns
/// `true` when it advanced + emitted.
fn handle_advance(app: &AppHandle, transcript: &str) -> bool {
    use lumenlive_detection::ReadingMode;

    let rm_managed: &Mutex<ReadingMode> = app.state::<Mutex<ReadingMode>>().inner();

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
pub(super) fn check_translation_command(app: &AppHandle, transcript: &str) {
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
