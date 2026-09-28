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

/// Orchestrator that combines text chunking, embedding, vector search,
/// and caching to detect Bible verses from transcript text using
/// semantic similarity.
pub struct SemanticDetector {
    embedder: Box<dyn TextEmbedder>,
    index: Box<dyn VectorIndex>,
    #[allow(dead_code)]
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
            // Single direct embedding: fast (~1 embed call), good for exact quotes.
            let Ok(embedding) = self.embedder.embed(&normalized) else {
                return vec![];
            };

            let Ok(results) = self.index.search(&embedding, 5) else {
                return vec![];
            };

            // Cache keyed by the normalized text: distinct raw transcripts that
            // canonicalize to the same string share the (expensive) embedding.
            self.cache
                .insert(normalized.clone(), (embedding, results.clone()));

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
        // Reuse a cached embedding for identical query text; only embed on miss.
        let cached = self.cache.get(&normalized).map(|(emb, _)| emb.clone());
        let embedding = match cached {
            Some(emb) => emb,
            None => match self.embedder.embed(&normalized) {
                Ok(emb) => emb,
                Err(_) => return vec![],
            },
        };
        let Ok(primary_results) = self.index.search(&embedding, k) else {
            return vec![];
        };

        let results = if should_run_adaptive_fallback(&primary_results) {
            self.adaptive_results(&normalized, primary_results, k)
        } else {
            primary_results
        };

        self.cache.insert(normalized, (embedding, results.clone()));
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
}
