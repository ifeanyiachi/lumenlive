use std::collections::{HashMap, HashSet};

use super::cache::EmbeddingCache;
use super::chunker::Chunker;
use super::embedder::{StubEmbedder, TextEmbedder};
use super::ensemble::EnsembleSearcher;
use super::index::{SearchResult, StubIndex, VectorIndex};
use super::normalize::normalize_archaic;
use super::synonyms::SynonymExpander;
use crate::types::Detection;

/// Default cache capacity (number of text-chunk entries).
const DEFAULT_CACHE_CAPACITY: usize = 256;

/// Default cosine-similarity threshold below which results are discarded.
const DEFAULT_CONFIDENCE_THRESHOLD: f64 = 0.50;

/// Run the paraphrase fallback when the fast search's winner is weak.
const ADAPTIVE_FALLBACK_MAX_TOP_SIMILARITY: f64 = 0.68;

/// Run the paraphrase fallback when the fast search's top two results are too
/// close to call confidently.
const ADAPTIVE_FALLBACK_MIN_TOP_MARGIN: f64 = 0.04;

/// When the whole-utterance embedding's best match is at least this similar, the
/// match is trusted as-is and the (more expensive) per-window re-probe is
/// skipped. This keeps clean, self-contained quotations on the fast single-embed
/// path and makes their results byte-identical to the pre-window behaviour.
const WINDOW_PROBE_MAX_TOP_SIMILARITY: f64 = 0.72;

/// Maximum number of sentence-windows to embed on the recall path, bounding the
/// extra ONNX cost a long final can incur. Windows are produced by [`Chunker`]
/// (1–2 sentences each); the first `WINDOW_PROBE_CAP` are probed.
const WINDOW_PROBE_CAP: usize = 6;

/// Orchestrator that combines text chunking, embedding, vector search,
/// and caching to detect Bible verses from transcript text using
/// semantic similarity.
pub struct SemanticDetector {
    embedder: Box<dyn TextEmbedder>,
    index: Box<dyn VectorIndex>,
    chunker: Chunker,
    cache: EmbeddingCache,
    confidence_threshold: f64,
    #[allow(dead_code)]
    synonym_expander: SynonymExpander,
    ensemble: EnsembleSearcher,
    /// When true, uses ensemble search (3 strategies) for better accuracy.
    /// When false, single direct embedding for speed.
    use_synonyms: bool,
}

impl SemanticDetector {
    /// Create a new detector backed by the given embedder and index.
    pub fn new(embedder: Box<dyn TextEmbedder>, index: Box<dyn VectorIndex>) -> Self {
        Self {
            embedder,
            index,
            chunker: Chunker::new(),
            cache: EmbeddingCache::new(DEFAULT_CACHE_CAPACITY),
            confidence_threshold: DEFAULT_CONFIDENCE_THRESHOLD,
            synonym_expander: SynonymExpander::new(),
            ensemble: EnsembleSearcher::new(),
            use_synonyms: false, // Off by default — enable via toggle_paraphrase_detection
        }
    }

    /// Create a detector with stub (no-op) implementations.
    ///
    /// The stub detector compiles and runs without model files but
    /// always returns empty results because its index is empty.
    pub fn stub() -> Self {
        Self::new(Box::new(StubEmbedder::new(1024)), Box::new(StubIndex))
    }

    /// Enable or disable synonym expansion (paraphrase detection mode).
    pub fn set_use_synonyms(&mut self, enabled: bool) {
        self.use_synonyms = enabled;
    }

    /// Returns whether synonym expansion is currently enabled.
    pub fn use_synonyms(&self) -> bool {
        self.use_synonyms
    }

    /// Returns `true` when the underlying index contains vectors and
    /// the detector can produce meaningful results.
    pub fn is_ready(&self) -> bool {
        !self.index.is_empty()
    }

    /// Embedding dimensionality of the active model (768 for bge, 1024 for qwen).
    pub fn dimension(&self) -> usize {
        self.embedder.dimension()
    }

    /// Number of verse vectors in the loaded index.
    pub fn index_len(&self) -> usize {
        self.index.len()
    }

    /// Detect Bible verses in `text` using semantic similarity.
    ///
    /// The text is split into overlapping sentence windows, each window
    /// is embedded, and the nearest verses in the vector index are
    /// returned if they exceed the confidence threshold.
    ///
    /// The returned `Detection` objects have placeholder `VerseRef`
    /// fields (all zeros / empty) — the caller is expected to resolve
    /// them using the `verse_id` from the underlying `SearchResult`.
    pub fn detect(&mut self, text: &str) -> Vec<Detection> {
        if !self.is_ready() {
            return vec![];
        }

        let mut detections = Vec::new();

        // Canonicalize archaic KJV vocabulary before embedding so the transcript
        // lands in the same lexical space as the pre-computed verse index (which
        // is normalized with the same rule table on the document side). The
        // original `text` is kept for the detection snippet/display; only the
        // embedded query is normalized. See `super::normalize`.
        let normalized = normalize_archaic(text);

        if self.use_synonyms {
            // Ensemble search: 3 strategies (original + synonym + concept)
            // More expensive (~3 embed calls) but much better accuracy for paraphrases.
            match self
                .ensemble
                .search(&normalized, self.embedder.as_ref(), self.index.as_ref(), 5)
            {
                Ok(results) => {
                    let now = Self::timestamp_ms();
                    for result in results {
                        if result.best_similarity >= self.confidence_threshold {
                            detections.push(Self::make_detection(
                                result.verse_id,
                                result.best_similarity,
                                text,
                                now,
                            ));
                        }
                    }
                }
                Err(e) => {
                    log::warn!("[SEMANTIC] Ensemble search failed: {e}");
                }
            }
        } else {
            // Single direct embedding is fast and ideal for exact quotes; but a
            // verbatim verse buried in a long run-on final is diluted by the
            // surrounding commentary and can fall out of the top-k entirely.
            // `search_best_over_windows` embeds the whole text first (the fast
            // path, unchanged for clean quotes) and only re-probes per
            // sentence-window when that match is weak. See its doc comment.
            let results = self.search_best_over_windows(text, 5);

            let now = Self::timestamp_ms();
            let mut seen_verse_ids = HashSet::new();
            for result in &results {
                if result.similarity >= self.confidence_threshold
                    && seen_verse_ids.insert(result.verse_id)
                {
                    detections.push(Self::make_detection(
                        result.verse_id,
                        result.similarity,
                        text,
                        now,
                    ));
                }
            }
        }

        // Cap results: sort by confidence, keep top 5
        detections.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        detections.truncate(5);

        detections
    }

    /// Update the minimum similarity threshold for a result to be
    /// included in the output.
    pub fn set_confidence_threshold(&mut self, threshold: f64) {
        self.confidence_threshold = threshold;
    }

    /// Direct query -> results for manual and live semantic search.
    /// Unlike `detect()`, this does NOT chunk the text or apply cooldown.
    ///
    /// The fast direct search is the normal path. When its winner is weak or
    /// ambiguous, an ensemble paraphrase search expands synonyms and biblical
    /// concepts, then merges strong candidates back into the same top-k list.
    /// This keeps ordinary quotations fast while improving recall for modern
    /// rewordings without adding a user-facing setting.
    ///
    /// The embedding cache remains important because embedding is the expensive
    /// step (~300-600ms of ONNX), while the index search is cheap. Identical or
    /// repeated transcript text — common with overlapping speech-final
    /// fragments — reuses the cached embedding.
    pub fn search_query(&mut self, query: &str, k: usize) -> Vec<(i64, f64)> {
        if !self.is_ready() {
            return vec![];
        }
        // Normalize archaic vocabulary into the same lexical space as the verse
        // index before embedding (and use it as the cache key). See `detect`.
        let normalized = normalize_archaic(query);
        // Primary search now includes per-window recall when the whole-text
        // match is weak, so a verse diluted by surrounding commentary is
        // recovered before the paraphrase fallback runs. Embedding is cached
        // inside the helper (keyed by normalized text).
        let primary_results = self.search_best_over_windows(query, k);

        let mut results = if should_run_adaptive_fallback(&primary_results) {
            self.adaptive_results(&normalized, primary_results, k)
        } else {
            primary_results
        };

        results.truncate(k);
        results.iter().map(|r| (r.verse_id, r.similarity)).collect()
    }

    /// Merge strong paraphrase candidates into a fast-search result set.
    fn adaptive_results(
        &mut self,
        query: &str,
        primary_results: Vec<SearchResult>,
        k: usize,
    ) -> Vec<SearchResult> {
        let Ok(paraphrase_results) =
            self.ensemble
                .search_for_recall(query, self.embedder.as_ref(), self.index.as_ref(), k)
        else {
            return primary_results;
        };

        let mut best_by_verse: HashMap<i64, f64> = primary_results
            .into_iter()
            .map(|result| (result.verse_id, result.similarity))
            .collect();

        for result in paraphrase_results {
            best_by_verse
                .entry(result.verse_id)
                .and_modify(|similarity| *similarity = similarity.max(result.best_similarity))
                .or_insert(result.best_similarity);
        }

        let mut merged: Vec<SearchResult> = best_by_verse
            .into_iter()
            .map(|(verse_id, similarity)| SearchResult {
                verse_id,
                similarity,
            })
            .collect();
        merged.sort_by(|a, b| {
            b.similarity
                .partial_cmp(&a.similarity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        merged.truncate(k);
        merged
    }

    /// Search the index for `text`, recovering recall on long utterances.
    ///
    /// A single embedding of a long run-on final — a quoted verse buried in
    /// surrounding commentary — is dominated by the non-verse words, so the
    /// correct verse can fall out of the top-k entirely. That dilution is what
    /// made verbatim mid-sermon readings go undetected while shorter, cleaner
    /// finals matched. This embeds the whole utterance first (the fast path,
    /// unchanged for clean quotes) and, ONLY when that best match is weak,
    /// additionally embeds each sentence-window ([`Chunker`]) and keeps the best
    /// similarity seen for each verse across every probe. A verse diluted in the
    /// whole-text embedding but crisp in one window is thereby recovered.
    ///
    /// Returns up to `max(k, 5)` results ranked by (best) similarity. Every
    /// embedding is cached by its normalized text, so overlapping/repeated
    /// finals re-probe without re-embedding.
    fn search_best_over_windows(&mut self, text: &str, k: usize) -> Vec<SearchResult> {
        let want = k.max(5);
        let normalized = normalize_archaic(text);

        let Ok(whole_embedding) = self.embedder.embed(&normalized) else {
            return vec![];
        };
        let Ok(whole) = self.index.search(&whole_embedding, want) else {
            return vec![];
        };
        // Cache keyed by normalized text: distinct raw transcripts that
        // canonicalize to the same string share the (expensive) embedding.
        self.cache
            .insert(normalized.clone(), (whole_embedding, whole.clone()));

        // Fast path: a strong whole-text match is trusted as-is. This preserves
        // byte-for-byte parity with the pre-window behaviour for clean,
        // self-contained quotations (and skips the extra embeds). An empty
        // result (stub/empty index) also short-circuits here.
        let trust_whole = match whole.first() {
            None => true,
            Some(best) => best.similarity >= WINDOW_PROBE_MAX_TOP_SIMILARITY,
        };
        if trust_whole {
            return whole;
        }

        // Weak whole-text match: re-probe per sentence-window and keep the best
        // similarity per verse. The whole-text hits seed the map so a verse that
        // is strong in neither place is never lost by the re-ranking.
        let mut best: HashMap<i64, f64> =
            whole.iter().map(|r| (r.verse_id, r.similarity)).collect();

        for window in self.chunker.chunk(text).into_iter().take(WINDOW_PROBE_CAP) {
            let wn = normalize_archaic(&window);
            if wn == normalized {
                continue; // identical to the whole-text probe already done
            }
            // Reuse a cached embedding for this window text; only embed on miss.
            let cached = self.cache.get(&wn).map(|(emb, _)| emb.clone());
            let embedding = match cached {
                Some(emb) => emb,
                None => match self.embedder.embed(&wn) {
                    Ok(emb) => emb,
                    Err(_) => continue,
                },
            };
            if let Ok(res) = self.index.search(&embedding, want) {
                self.cache.insert(wn, (embedding, res.clone()));
                for r in res {
                    best.entry(r.verse_id)
                        .and_modify(|s| *s = s.max(r.similarity))
                        .or_insert(r.similarity);
                }
            }
        }

        let mut merged: Vec<SearchResult> = best
            .into_iter()
            .map(|(verse_id, similarity)| SearchResult {
                verse_id,
                similarity,
            })
            .collect();
        merged.sort_by(|a, b| {
            b.similarity
                .partial_cmp(&a.similarity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        merged.truncate(want);
        merged
    }

    // ---- private helpers ----

    fn timestamp_ms() -> u64 {
        Detection::now_millis()
    }

    fn make_detection(
        verse_id: i64,
        similarity: f64,
        snippet: &str,
        detected_at: u64,
    ) -> Detection {
        Detection::semantic(verse_id, similarity, snippet.to_string(), detected_at)
    }
}

/// Decide whether a direct vector search needs the more expensive paraphrase
/// fallback. Empty and single-result searches are treated as uncertain because
/// they have no reliable score margin.
fn should_run_adaptive_fallback(results: &[SearchResult]) -> bool {
    let Some(best) = results.first() else {
        return true;
    };

    if best.similarity < ADAPTIVE_FALLBACK_MAX_TOP_SIMILARITY {
        return true;
    }

    let Some(second) = results.get(1) else {
        return true;
    };

    best.similarity - second.similarity < ADAPTIVE_FALLBACK_MIN_TOP_MARGIN
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::semantic::index::SearchResult;
    use crate::types::DetectionSource;
    use crate::DetectionError;

    /// A fake index that always returns a fixed set of results.
    struct FakeIndex {
        results: Vec<SearchResult>,
    }

    struct AdaptiveEmbedder;

    impl TextEmbedder for AdaptiveEmbedder {
        fn embed(&self, text: &str) -> Result<Vec<f32>, DetectionError> {
            Ok(vec![f32::from(text.contains("rescue"))])
        }

        fn dimension(&self) -> usize {
            1
        }
    }

    struct AdaptiveIndex;

    impl VectorIndex for AdaptiveIndex {
        fn search(&self, query: &[f32], k: usize) -> Result<Vec<SearchResult>, DetectionError> {
            let results = if query[0] > 0.5 {
                vec![SearchResult {
                    verse_id: 99,
                    similarity: 0.80,
                }]
            } else {
                vec![SearchResult {
                    verse_id: 1,
                    similarity: 0.60,
                }]
            };
            Ok(results.into_iter().take(k).collect())
        }

        fn len(&self) -> usize {
            2
        }
    }

    impl VectorIndex for FakeIndex {
        fn search(&self, _query: &[f32], k: usize) -> Result<Vec<SearchResult>, DetectionError> {
            Ok(self.results.iter().take(k).cloned().collect())
        }

        fn len(&self) -> usize {
            self.results.len()
        }
    }

    #[test]
    fn test_stub_returns_empty() {
        let mut detector = SemanticDetector::stub();
        let results = detector.detect("for God so loved the world");
        assert!(results.is_empty());
    }

    #[test]
    fn test_stub_is_not_ready() {
        let detector = SemanticDetector::stub();
        assert!(!detector.is_ready());
    }

    #[test]
    fn test_detection_with_fake_index() {
        let fake_results = vec![
            SearchResult {
                verse_id: 1001,
                similarity: 0.85,
            },
            SearchResult {
                verse_id: 1002,
                similarity: 0.20,
            },
        ];

        let mut detector = SemanticDetector::new(
            Box::new(StubEmbedder::new(128)),
            Box::new(FakeIndex {
                results: fake_results,
            }),
        );

        assert!(detector.is_ready());

        let detections =
            detector.detect("for God so loved the world that he gave his only begotten son");

        // Should include the high-similarity result but not the 0.20 one
        assert!(!detections.is_empty());
        for d in &detections {
            assert!(d.confidence >= 0.35);
            assert!(matches!(d.source, DetectionSource::Semantic { .. }));
        }
    }

    #[test]
    fn test_threshold_adjustment() {
        let fake_results = vec![SearchResult {
            verse_id: 1001,
            similarity: 0.60,
        }];

        let mut detector = SemanticDetector::new(
            Box::new(StubEmbedder::new(128)),
            Box::new(FakeIndex {
                results: fake_results,
            }),
        );

        // Default threshold is 0.50 — should include 0.60
        let detections = detector.detect("for God so loved the world that he gave his son");
        assert!(!detections.is_empty());

        // Raise threshold above the result's similarity
        detector.set_confidence_threshold(0.70);
        let detections =
            detector.detect("whoever believes in him shall not perish but have everlasting life");
        assert!(detections.is_empty());
    }

    #[test]
    fn adaptive_search_adds_a_strong_synonym_candidate() {
        let mut detector =
            SemanticDetector::new(Box::new(AdaptiveEmbedder), Box::new(AdaptiveIndex));

        let results = detector.search_query("God saved the world", 3);

        assert_eq!(results[0].0, 99);
        assert!((results[0].1 - 0.80).abs() < f64::EPSILON);
        assert!(results.iter().any(|(verse_id, _)| *verse_id == 1));
    }

    // ---- Window-recall (dilution) parity + recall tests ----

    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Models the dilution regime. Verse 100 is the "target": its signature
    /// phrase, in isolation, is a crisp match; spread thin through a long
    /// commentary-laden final it becomes weak. Verse 200 is a steady, mediocre
    /// whole-text distractor. The embedder counts its own calls so the tests can
    /// prove the fast path embeds exactly once.
    struct DilutionEmbedder {
        embed_calls: Arc<AtomicUsize>,
    }

    /// The target verse's signature phrase (6 words).
    const TARGET_PHRASE: &str = "obeyed the voice of the lord";

    impl TextEmbedder for DilutionEmbedder {
        fn embed(&self, text: &str) -> Result<Vec<f32>, DetectionError> {
            self.embed_calls.fetch_add(1, Ordering::Relaxed);
            let lower = text.to_lowercase();
            let words = lower.split_whitespace().count().max(1);
            // Density of the 6-word target phrase: 1.0 when the text IS the
            // phrase, shrinking as commentary dilutes it.
            let phrase_hits = lower.matches(TARGET_PHRASE).count();
            #[expect(clippy::cast_precision_loss, reason = "small counts in tests")]
            let target = ((phrase_hits * 6) as f32 / words as f32).min(1.0);
            // Distractor is a constant, mediocre whole-text match that stays
            // below the window-probe gate so it never masks a diluted target.
            Ok(vec![target, 0.65])
        }

        fn dimension(&self) -> usize {
            2
        }
    }

    /// Dimension 0 → verse 100 (target), dimension 1 → verse 200 (distractor).
    struct DilutionIndex;

    impl VectorIndex for DilutionIndex {
        fn search(&self, query: &[f32], k: usize) -> Result<Vec<SearchResult>, DetectionError> {
            let mut r = vec![
                SearchResult {
                    verse_id: 100,
                    similarity: f64::from(query[0]),
                },
                SearchResult {
                    verse_id: 200,
                    similarity: f64::from(query[1]),
                },
            ];
            r.sort_by(|a, b| {
                b.similarity
                    .partial_cmp(&a.similarity)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            r.truncate(k);
            Ok(r)
        }

        fn len(&self) -> usize {
            2
        }
    }

    fn dilution_detector() -> (SemanticDetector, Arc<AtomicUsize>) {
        let calls = Arc::new(AtomicUsize::new(0));
        let detector = SemanticDetector::new(
            Box::new(DilutionEmbedder {
                embed_calls: Arc::clone(&calls),
            }),
            Box::new(DilutionIndex),
        );
        (detector, calls)
    }

    #[test]
    fn clean_quote_uses_fast_path_unchanged() {
        // A clean, self-contained quotation matches the whole-text embedding
        // strongly (>= WINDOW_PROBE_MAX_TOP_SIMILARITY), so the target wins on a
        // SINGLE embed with no window re-probe — byte-for-byte the pre-window
        // behaviour.
        let (mut detector, calls) = dilution_detector();

        let results = detector.search_query(TARGET_PHRASE, 10);

        assert_eq!(results[0].0, 100, "target verse wins the clean quote");
        assert!((results[0].1 - 1.0).abs() < 1e-9, "at full similarity");
        assert_eq!(
            calls.load(Ordering::Relaxed),
            1,
            "clean quote must embed exactly once (fast path, no window probe)"
        );
    }

    #[test]
    fn diluted_quote_is_recovered_by_window_probe() {
        // The target phrase buried in a long run-on final: its whole-text
        // density is low, so a plain single-embed search ranks the distractor
        // (verse 200) first. The sermon text is one commentary sentence, the
        // verse sentence, then more commentary.
        // One commentary sentence, the verse sentence, then more commentary.
        // Whole-text target density ≈ 6/23 ≈ 0.26, below the distractor's 0.65
        // (see `diluted_quote_without_windowing_would_miss` for the premise).
        let diluted = "the preacher spoke at length this morning. \
             obeyed the voice of the lord. \
             and then he continued speaking for a long while about many things";

        let (mut probe, calls) = dilution_detector();
        let results = probe.search_query(diluted, 10);

        assert_eq!(
            results[0].0, 100,
            "windowed recall must lift the diluted target verse to the top"
        );
        assert!(
            (results[0].1 - 1.0).abs() < 1e-9,
            "the target's own sentence-window matches at full similarity"
        );
        assert!(
            results.iter().any(|(id, _)| *id == 200),
            "distractor is retained, just out-ranked"
        );
        assert!(
            calls.load(Ordering::Relaxed) > 1,
            "a weak whole-text match must trigger per-window re-probing"
        );
    }

    #[test]
    fn diluted_quote_without_windowing_would_miss() {
        // Guards the premise of the recovery test: on the diluted final the
        // whole-text embedding alone ranks the distractor first. We assert this
        // via the embedder/index directly (the pre-window path).
        let diluted = "the preacher spoke at length this morning. \
             obeyed the voice of the lord. \
             and then he continued speaking for a long while about many things";
        let embedder = DilutionEmbedder {
            embed_calls: Arc::new(AtomicUsize::new(0)),
        };
        let index = DilutionIndex;
        // The target phrase carries no archaic vocabulary, so normalization is a
        // no-op here — embed the raw text directly to model the pre-window path.
        let emb = embedder.embed(diluted).unwrap();
        let whole = index.search(&emb, 5).unwrap();
        assert_eq!(
            whole[0].verse_id, 200,
            "premise: whole-text alone mis-ranks the distractor first"
        );
    }
}
