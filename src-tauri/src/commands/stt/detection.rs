//! Live verse detection off the transcript stream: instant direct (pattern)
//! detection, hybrid semantic (vector + FTS5) detection, and voice translation
//! commands. These run inside `spawn_blocking` workers so
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

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::bible_state::BibleState;

use super::truncate_safe;

/// Reset all long-lived detector state at the start of a transcription session.
///
/// The detectors (`DirectDetector`, `DetectionMerger`) are
/// process-lifetime managed singletons (`lib.rs`) that are never dropped, so
/// without this a new service inherits the previous run's accumulated held
/// references, 60-second sticky book/chapter context, and auto-display cooldown
/// — the structural cause of detection "degrading over time" (aitrans §2,
/// Phase 1). Thresholds on the merger are configuration and
/// are intentionally preserved. Best-effort: a poisoned lock is logged and
/// skipped rather than aborting the start.
pub(super) fn reset_detection_state(app: &AppHandle) {
    use lumenlive_detection::{DetectionMerger, DirectDetector};

    match app.state::<Mutex<DirectDetector>>().lock() {
        Ok(mut d) => d.reset(),
        Err(e) => log::error!("[DET] DirectDetector reset skipped (lock poisoned): {e}"),
    }
    match app.state::<Mutex<DetectionMerger>>().lock() {
        Ok(mut m) => m.reset(),
        Err(e) => log::error!("[DET] DetectionMerger reset skipped (lock poisoned): {e}"),
    }
    log::info!("[DET] Detector state reset for new transcription session");
}

/// Record every emitted detection into the durable per-session transcript file
/// (see [`super::TranscriptRecorder`]), tagged with its `source` (`"direct"`,
/// `"direct-partial"`, `"semantic-partial"`, or `"semantic"`). Best-effort: a
/// poisoned lock is skipped so recording never disturbs detection. No-op between
/// transcription sessions.
fn record_detections(
    app: &AppHandle,
    source: &str,
    results: &[crate::commands::detection::DetectionResult],
) {
    let rec_state: State<'_, Mutex<super::TranscriptRecorder>> = app.state();
    let Ok(mut rec) = rec_state.lock() else {
        return;
    };
    for r in results {
        rec.detection(
            source,
            &format!(
                "{} ({:.0}%) auto_q={}",
                r.verse_ref,
                r.confidence * 100.0,
                r.auto_queued
            ),
        );
    }
}

/// Run direct (regex/pattern) detection only. Instant, no ONNX.
/// Locks its own `Mutex<DirectDetector>` (so it never blocks on the semantic
/// worker's ONNX under the pipeline lock) but merges through the SHARED
/// `Mutex<DetectionMerger>` — the same instance the semantic worker uses — so
/// the anti-flood cooldown coordinates across both channels.
/// Runs direct detection and emits any resolved references.
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
pub(super) fn run_direct_detection(app: &AppHandle, transcript: &str, is_final: bool) {
    use lumenlive_detection::{DirectDetector, DetectionMerger, MergedDetection};

    let t0 = std::time::Instant::now();
    let detector_state: State<'_, Mutex<DirectDetector>> = app.state();
    let mut detector = match detector_state.lock() {
        Ok(d) => d,
        Err(e) => {
            log::error!("Failed to lock DirectDetector: {e}");
            return;
        }
    };
    let direct_results = detector.detect(transcript);
    drop(detector); // Release immediately

    if direct_results.is_empty() {
        return;
    }

    // Partial path: panel-only display, merger bypassed (see fn doc). Wrap each
    // raw detection as a non-auto-queued MergedDetection purely so the existing
    // `to_result` verse-resolver can be reused, then emit on the partial event.
    if !is_final {
        let bible_managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(bible) = bible_managed.lock() else {
            log::error!("[DET-DIRECT] BibleState lock poisoned (partial)");
            return;
        };
        let results: Vec<crate::commands::detection::DetectionResult> = direct_results
            .into_iter()
            .filter_map(|d| {
                crate::commands::detection::to_result(
                    &bible,
                    &MergedDetection { detection: d, auto_queued: false },
                )
            })
            .collect();
        drop(bible);
        if !results.is_empty() {
            record_detections(app, "direct-partial", &results);
            let _ = app.emit("verse_detections_partial", &results);
            log::debug!(
                "[DET-DIRECT] partial emitted {} ({}) in {:?}",
                results.len(),
                results
                    .iter()
                    .map(|r| r.verse_ref.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
                t0.elapsed()
            );
        }
        return;
    }

    // Merge using the managed merger (persists cooldown state across calls,
    // preventing duplicate emissions when running on both partials and finals)
    let merger_state: State<'_, Mutex<DetectionMerger>> = app.state();
    let mut merger = match merger_state.lock() {
        Ok(m) => m,
        Err(e) => {
            log::error!("Failed to lock DetectionMerger: {e}");
            return;
        }
    };
    let merged = merger.merge(direct_results, vec![]);
    drop(merger);
    if merged.is_empty() {
        return;
    }

    // Resolve verse info from the dedicated Bible DB lock. A blocking lock is
    // fine here — this runs inside spawn_blocking (not on the async runtime)
    // and DB lookups are short, so verse text is always resolved. (Previously
    // this used try_lock against the shared AppState mutex and, on contention
    // with the semantic worker, emitted detections without verse text.)
    let bible_managed: State<'_, Mutex<BibleState>> = app.state();
    let Ok(bible) = bible_managed.lock() else {
        log::error!("[DET-DIRECT] BibleState lock poisoned");
        return;
    };
    let results: Vec<crate::commands::detection::DetectionResult> = merged
        .iter()
        .filter_map(|m| crate::commands::detection::to_result(&bible, m))
        .collect();
    drop(bible);
    for r in &results {
        log::info!("[DET-DIRECT] Found: {} ({:.0}%)", r.verse_ref, r.confidence * 100.0);
    }
    record_detections(app, "direct", &results);
    let _ = app.emit("verse_detections", &results);
    log::info!("[DET-DIRECT] Detection took {:?} for {:?}", t0.elapsed(), truncate_safe(transcript, 50));
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

/// Minimum transcript quotation likelihood for the *final* (authoritative)
/// semantic path to run at all. The vector search returns its nearest verses for
/// ANY 5+word utterance, so without this every line of ordinary preaching
/// surfaced up to [`SEMANTIC_MAX_RESULTS`] rotating guesses in the panel. Gating
/// on the same quotation signal and threshold as the preview
/// ([`SEMANTIC_PREVIEW_MIN_QUOTATION`]) means the two paths agree on what "looks
/// like a scripture quotation" is — archaic register or a citation cue — so the
/// panel stays quiet during exposition. Deliberate recall tradeoff: a purely
/// modern-language paraphrase with no quotation markers no longer auto-surfaces
/// (explicit references are unaffected — that is the direct path — and the
/// operator can still find a verse by manual search).
const SEMANTIC_FINAL_MIN_QUOTATION: f64 = SEMANTIC_PREVIEW_MIN_QUOTATION;

/// How many FTS5 candidates the preview considers. The top keyword hit is the
/// quoted verse in the common case; the floor ([`FTS_ONLY_FLOOR`]) trims the tail.
const SEMANTIC_PREVIEW_FTS_K: usize = 5;

/// Hard cap on detections surfaced to the panel per semantic emit. The vector
/// (top 10) and FTS (top 10) searches fuse into as many as ~20 candidates; the
/// merger sorts them by confidence descending and drops sub-threshold hits, so
/// taking the first N keeps only the strongest few and discards the long tail
/// of weak matches. Kept small (winner + a couple of alternates) so one utterance
/// contributes a tight ranked shortlist, not a wide spread of books, to the panel.
const SEMANTIC_MAX_RESULTS: usize = 3;

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
            crate::commands::detection::to_result(
                &bible,
                &MergedDetection { detection: det, auto_queued: false },
            )
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

/// Run the panel-only semantic path on an interim transcript.
///
/// This deliberately does not use the quotation gate or the shared merger. The
/// final semantic path remains quotation-gated and authoritative; this path is
/// only an early suggestion stream, filtered by the operator's frontend floor.
/// It uses vector similarity rather than FTS so modern-language paraphrases can
/// surface before the speaker reaches an utterance boundary.
pub(super) fn run_semantic_partial_detection(app: &AppHandle, transcript: &str) {
    use lumenlive_detection::{Detection, MergedDetection};

    let vector_hits: Vec<(i64, f64)> = {
        let pipeline_state: State<'_, Mutex<lumenlive_detection::DetectionPipeline>> =
            app.state();
        let Ok(mut pipeline) = pipeline_state.lock() else {
            log::error!("[DET-SEMANTIC-PARTIAL] Failed to lock DetectionPipeline");
            return;
        };
        pipeline.semantic_search(transcript, 5)
    };

    if vector_hits.is_empty() {
        log::debug!("[DET-SEMANTIC-PARTIAL] No vector candidates");
        return;
    }

    let snippet = truncate_safe(transcript, 100).to_string();
    let managed: State<'_, Mutex<BibleState>> = app.state();
    let Ok(bible) = managed.lock() else {
        log::error!("[DET-SEMANTIC-PARTIAL] Failed to lock BibleState");
        return;
    };

    let results: Vec<crate::commands::detection::DetectionResult> = vector_hits
        .into_iter()
        .take(3)
        .filter_map(|(verse_id, similarity)| {
            let detection = Detection::semantic(
                verse_id,
                similarity,
                snippet.clone(),
                Detection::now_millis(),
            );
            crate::commands::detection::to_result(
                &bible,
                &MergedDetection {
                    detection,
                    auto_queued: false,
                },
            )
        })
        .collect();
    drop(bible);

    if results.is_empty() {
        return;
    }

    record_detections(app, "semantic-partial", &results);
    let _ = app.emit("verse_detections_partial", &results);
    log::debug!(
        "[DET-SEMANTIC-PARTIAL] emitted {} vector candidate(s)",
        results.len()
    );
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
    log::info!("[DET-SEMANTIC] Running on: {transcript:?}");

    // 0. Optimistic keyword preview: if this utterance looks like a quotation,
    //    surface the top FTS candidate(s) in the panel NOW, before the ONNX embed
    //    below adds its ~300-600ms. Panel-only + merger-bypassing (see fn doc);
    //    the authoritative emit further down is unchanged.
    emit_semantic_preview(app, transcript);

    // 0b. Quotation gate: the vector search below always returns its nearest
    //     verses for any 5+word utterance, so run the authoritative path only
    //     when the utterance actually looks like a scripture quotation (archaic
    //     register or a citation cue). This keeps ordinary preaching from
    //     surfacing a rotating shortlist of guesses in the panel, and skips the
    //     ONNX embed entirely on non-quotation speech. See
    //     SEMANTIC_FINAL_MIN_QUOTATION for the deliberate recall tradeoff.
    if quotation::quotation_score(transcript, None) < SEMANTIC_FINAL_MIN_QUOTATION {
        log::debug!("[DET-SEMANTIC] skipped: below quotation gate");
        return;
    }

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

    // Full ranked candidate list (winners AND runner-ups) with scores. A
    // said-vs-displayed mismatch usually means the right verse placed #2 or lost
    // by a few points — the resolved `Found:` lines below only show the winners,
    // so this line is what reveals why the wrong verse won.
    if log::log_enabled!(log::Level::Info) {
        let candidates = merged
            .iter()
            .map(|c| {
                let d = &c.detection;
                let src = match d.source {
                    DetectionSource::Semantic { .. } => "sem",
                    DetectionSource::DirectReference => "dir",
                };
                let q = if c.auto_queued { " AQ" } else { "" };
                format!(
                    "{} {}:{}={:.0}%[{src}{q}]",
                    d.verse_ref.book_name,
                    d.verse_ref.chapter,
                    d.verse_ref.verse_start,
                    d.confidence * 100.0
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        log::info!("[DET-SEMANTIC] Candidates ({}): {candidates}", merged.len());
    }

    // 4. Resolve each merged detection to a full verse result in the active translation.
    let results: Vec<crate::commands::detection::DetectionResult> = {
        let managed: State<'_, Mutex<BibleState>> = app.state();
        let Ok(bible) = managed.lock() else {
            log::error!("[DET-SEMANTIC] Failed to lock BibleState for verse resolution");
            return;
        };
        // Top-N only: the merger already ranked by confidence descending and
        // dropped anything below threshold, so the first SEMANTIC_MAX_RESULTS
        // are the best-scoring verses that passed. The weak tail is discarded.
        merged
            .iter()
            .take(SEMANTIC_MAX_RESULTS)
            .filter_map(|m| crate::commands::detection::to_result(&bible, m))
            .collect()
    };

    for r in &results {
        log::info!(
            "[DET-SEMANTIC] Found: {} ({:.0}% {}) auto_q={}",
            r.verse_ref, r.confidence * 100.0, r.source, r.auto_queued
        );
    }
    record_detections(app, "semantic", &results);
    let _ = app.emit("verse_detections", &results);
    log::info!("[DET-SEMANTIC] Total: {:?}", t0.elapsed());
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

/// Check for a spoken *verse* command — a jump to a specific verse ("go to the
/// third verse", "verse 5") or a multi-step relative move ("skip the next two
/// verses") — and emit `verse_command` with the intent.
///
/// The payload is a tagged union mirroring `VerseCommand`:
/// - `{ kind: "relative", direction: "next" | "previous", count }`
/// - `{ kind: "absolute", verse }`
///
/// Like [`check_navigation_command`], the command carries only intent; the verse
/// to act on is resolved frontend-side against the live selection. Finals-only,
/// for the same reason: verse jumps and multi-steps are not idempotent, so
/// running on volatile partials would double-fire when the final repeats.
pub(super) fn check_verse_command(app: &AppHandle, transcript: &str) {
    use lumenlive_detection::{DirectDetector, NavDirection, VerseCommand};

    #[derive(serde::Serialize, Clone, Debug)]
    #[serde(tag = "kind", rename_all = "lowercase")]
    enum VerseCommandPayload {
        Relative {
            direction: &'static str,
            count: u32,
        },
        Absolute {
            verse: u32,
        },
    }

    let detector_state: State<'_, Mutex<DirectDetector>> = app.state();
    let command = {
        let Ok(detector) = detector_state.lock() else {
            return;
        };
        detector.detect_verse_command(transcript)
    };
    let Some(command) = command else { return };

    let payload = match command {
        VerseCommand::Relative { direction, count } => VerseCommandPayload::Relative {
            direction: match direction {
                NavDirection::Next => "next",
                NavDirection::Previous => "previous",
            },
            count,
        },
        VerseCommand::Absolute { verse } => VerseCommandPayload::Absolute { verse },
    };

    log::info!("[STT] Voice verse command: {payload:?}");
    let _ = app.emit("verse_command", payload);
}

/// Check for a spoken *slide* command — "next slide", "go back to the previous
/// slide" — and emit `slide_command` with the intent.
///
/// The payload mirrors `verse_command`'s relative arm:
/// `{ direction: "next" | "previous", count }`.
///
/// This drives the **schedule list** (its items and their sub-slides), not
/// verses, and is kept fully separate from the verse-command path — the two are
/// keyword-disjoint at the detector level (slide phrases require "slide"), so
/// both classifiers run on the same final transcript without colliding. Like the
/// verse commands, the payload carries only intent; the schedule store resolves
/// the target against the currently active schedule item. Finals-only for the
/// same reason: a step is not idempotent, so running on volatile partials would
/// double-fire when the final repeats.
pub(super) fn check_slide_command(app: &AppHandle, transcript: &str) {
    use lumenlive_detection::{DirectDetector, NavDirection, SlideCommand};

    #[derive(serde::Serialize, Clone, Debug)]
    struct SlideCommandPayload {
        direction: &'static str,
        count: u32,
    }

    let detector_state: State<'_, Mutex<DirectDetector>> = app.state();
    let command = {
        let Ok(detector) = detector_state.lock() else {
            return;
        };
        detector.detect_slide_command(transcript)
    };
    let Some(SlideCommand { direction, count }) = command else {
        return;
    };

    let payload = SlideCommandPayload {
        direction: match direction {
            NavDirection::Next => "next",
            NavDirection::Previous => "previous",
        },
        count,
    };

    log::info!("[STT] Voice slide command: {payload:?}");
    let _ = app.emit("slide_command", payload);
}
