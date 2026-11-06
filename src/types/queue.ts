import type { Verse } from "./bible"
import type { Slide } from "./slide"

export interface QueueItem {
  id: string
  verse: Verse
  reference: string
  confidence: number
  source: "manual" | "ai-direct" | "ai-semantic" | "ai-cloud"
  added_at: number
  /** True when queued from a chapter-only detection (verse defaults to 1, may be refined). */
  is_chapter_only?: boolean
  /** When set, this item represents a grouped multi-verse selection. */
  verses?: Verse[]
  /**
   * Item kind. Absent/"verse" is a normal scripture item (default). "lexicon" is
   * a word-study card projected as a {@link slide}; its `verse` is the source
   * verse the word came from (kept for context/dedup, not for rendering).
   */
  kind?: "verse" | "lexicon"
  /** The slide to present when `kind` is "lexicon". */
  slide?: Slide
}
