use serde::{Deserialize, Serialize};

/// A reference to a specific Bible verse or verse range.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq, Hash)]
pub struct VerseRef {
    pub book_number: i32,
    pub book_name: String,
    pub chapter: i32,
    pub verse_start: i32,
    pub verse_end: Option<i32>,
}

/// Indicates how a detection was made.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum DetectionSource {
    DirectReference,
    Semantic { similarity: f64 },
}

/// A single detected Bible reference in transcript text.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Detection {
    pub verse_ref: VerseRef,
    /// Database primary key from semantic search (verses.id).
    /// Only set for semantic detections; direct detections use `verse_ref` fields instead.
    pub verse_id: Option<i64>,
    pub confidence: f64,
    pub source: DetectionSource,
    pub transcript_snippet: String,
    pub detected_at: u64,
    /// True when the detection was emitted from a chapter-only reference (no verse spoken yet).
    /// The verse defaults to 1 and may be refined later when the speaker says the verse number.
    #[serde(default)]
    pub is_chapter_only: bool,
}

impl Detection {
    /// Current wall-clock time in unix milliseconds. Shared by every detection
    /// path so the timestamp construction lives in exactly one place.
    #[expect(clippy::cast_possible_truncation, reason = "timestamp millis won't exceed u64 for centuries")]
    pub fn now_millis() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }

    /// Build a direct-reference detection (the Aho-Corasick parser path). Stamps
    /// `detected_at` with the current time; `verse_id` is `None` (direct
    /// detections carry their reference in `verse_ref`) and `is_chapter_only`
    /// defaults to `false`.
    pub fn direct(verse_ref: VerseRef, confidence: f64, transcript_snippet: String) -> Self {
        Self {
            verse_ref,
            verse_id: None,
            confidence,
            source: DetectionSource::DirectReference,
            transcript_snippet,
            detected_at: Self::now_millis(),
            is_chapter_only: false,
        }
    }

    /// Build a semantic (vector-search) detection keyed by the database
    /// `verse_id`. The `verse_ref` is left empty — it is resolved from
    /// `verse_id` downstream. `confidence` mirrors the cosine `similarity`.
    pub fn semantic(verse_id: i64, similarity: f64, transcript_snippet: String, detected_at: u64) -> Self {
        Self {
            verse_ref: VerseRef {
                book_number: 0,
                book_name: String::new(),
                chapter: 0,
                verse_start: 0,
                verse_end: None,
            },
            verse_id: Some(verse_id),
            confidence: similarity,
            source: DetectionSource::Semantic { similarity },
            transcript_snippet,
            detected_at,
            is_chapter_only: false,
        }
    }
}
