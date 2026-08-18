use crate::direct::detector::DirectDetector;
use crate::merger::{DetectionMerger, MergedDetection};
use crate::semantic::detector::SemanticDetector;

/// Minimum word count for vector embedding search (short text lacks semantic signal).
const MIN_WORDS_FOR_VECTOR: usize = 5;

/// The main detection pipeline that runs on each transcript segment.
///
/// Orchestrates direct reference detection and semantic search. Merging is the
/// caller's responsibility via a shared [`DetectionMerger`]: the live direct and
/// semantic workers, and the `detect_verses` command, all merge through the same
/// merger instance so that the anti-flood cooldown coordinates across every
/// detection channel (previously each channel owned its own cooldown clock).
pub struct DetectionPipeline {
    direct: DirectDetector,
    semantic: SemanticDetector,
}

impl DetectionPipeline {
    pub fn new() -> Self {
        Self {
            direct: DirectDetector::new(),
            semantic: SemanticDetector::stub(),
        }
    }

    /// Replace the semantic detector (e.g., after loading an ONNX model).
    pub fn set_semantic(&mut self, detector: SemanticDetector) {
        self.semantic = detector;
    }

    /// Run the full pipeline (direct + semantic), merging through the caller's
    /// shared merger. Used by the `detect_verses` command.
    ///
    /// Semantic (meaning-match) confidences are lifted by a transcript-derived
    /// quotation likelihood before merging, so an actual quotation ranks above a
    /// loose allusion — while preaching that merely alludes to a verse keeps its
    /// raw confidence (never penalized) and still surfaces. Direct spoken
    /// references are already citations and are passed through unmodulated. This
    /// path has no resolved candidate verse text, so only the transcript-only
    /// signals (archaic register + citation cues) apply; the live semantic worker
    /// additionally uses verbatim overlap. See [`crate::quotation`].
    pub fn process(&mut self, text: &str, merger: &mut DetectionMerger) -> Vec<MergedDetection> {
        let direct_results = self.direct.detect(text);

        let mut semantic_results = if text.split_whitespace().count() >= MIN_WORDS_FOR_VECTOR {
            self.semantic.detect(text)
        } else {
            vec![]
        };

        if !semantic_results.is_empty() {
            let quotation = crate::quotation::quotation_score(text, None);
            for d in &mut semantic_results {
                d.confidence = crate::quotation::adjust_confidence(d.confidence, quotation);
            }
        }

        merger.merge(direct_results, semantic_results)
    }

    /// Check if semantic search is available (model loaded + index populated).
    pub fn has_semantic(&self) -> bool {
        self.semantic.is_ready()
    }

    /// Enable or disable synonym expansion (paraphrase detection mode).
    pub fn set_use_synonyms(&mut self, enabled: bool) {
        self.semantic.set_use_synonyms(enabled);
    }

    /// Returns whether synonym expansion is currently enabled.
    pub fn use_synonyms(&self) -> bool {
        self.semantic.use_synonyms()
    }

    /// Run a standalone semantic search query (for the search UI).
    pub fn semantic_search(&mut self, query: &str, k: usize) -> Vec<(i64, f64)> {
        self.semantic.search_query(query, k)
    }

}

impl Default for DetectionPipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pipeline_direct_only() {
        let mut pipeline = DetectionPipeline::new();
        let mut merger = DetectionMerger::new();
        let results = pipeline.process("Jesus said in John 3:16 that God loved the world", &mut merger);
        assert!(!results.is_empty());
        assert_eq!(results[0].detection.verse_ref.book_name, "John");
        assert_eq!(results[0].detection.verse_ref.chapter, 3);
        assert_eq!(results[0].detection.verse_ref.verse_start, 16);
    }

    #[test]
    fn test_pipeline_no_match() {
        let mut pipeline = DetectionPipeline::new();
        let mut merger = DetectionMerger::new();
        let results = pipeline.process("The weather is nice today", &mut merger);
        assert!(results.is_empty());
    }

    #[test]
    fn test_pipeline_multiple_references() {
        let mut pipeline = DetectionPipeline::new();
        let mut merger = DetectionMerger::new();
        let results =
            pipeline.process("Compare John 3:16 with Romans 5:8 for understanding God's love", &mut merger);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_pipeline_semantic_not_ready_by_default() {
        let pipeline = DetectionPipeline::new();
        assert!(!pipeline.has_semantic());
    }

    #[test]
    fn test_pipeline_auto_queue_for_direct() {
        let mut pipeline = DetectionPipeline::new();
        let mut merger = DetectionMerger::new();
        let results = pipeline.process("John 3:16", &mut merger);
        assert!(!results.is_empty());
        // Direct references have confidence >= 0.90 which is above the
        // default auto_queue_threshold (0.80), so should be auto-queued.
        assert!(results[0].auto_queued);
    }
}
