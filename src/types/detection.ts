export interface DetectionResult {
  verse_ref: string
  verse_text: string
  book_name: string
  book_number: number
  chapter: number
  verse: number
  confidence: number
  source: "direct" | "semantic"
  auto_queued: boolean
  transcript_snippet: string
  /** True when detected from a chapter-only reference (verse defaults to 1, may be refined). */
  is_chapter_only: boolean
  /**
   * True when this is a low-trust NARRATIVE mention: a book name spoken in prose
   * (no citation cue) while Reading Mode is actively tracking a *different* book
   * — e.g. "Obadiah" named as a character during a reading of 1 Kings 18
   * (aitrans Phase 3). Such hits must NOT auto-display; they still surface in the
   * AI Detections panel/queue for a deliberate send. Optional for backward
   * compatibility with payloads that predate the flag (defaults false).
   */
  narrative_mention?: boolean
}

export interface ReadingAdvance {
  book_number: number
  book_name: string
  chapter: number
  verse: number
  verse_text: string
  reference: string
  confidence: number
}

export interface DetectionStatus {
  has_direct: boolean
  has_semantic: boolean
}

export interface SemanticSearchResult {
  verse_ref: string
  verse_text: string
  book_name: string
  book_number: number
  chapter: number
  verse: number
  similarity: number
}
