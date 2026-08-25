import type { StyledSpan } from "./verse-edit"

/** The card's text fields that can carry inline formatting (bold/italic/…). */
export type LexiconField =
  | "summary"
  | "lemma"
  | "partOfSpeech"
  | "transliteration"
  | "pronunciation"
  | "kjvUsage"
  | "wordOrigin"
  | "definition"

/**
 * Resolved data for a "Lexical Summary" card, ready to rasterize. String fields
 * hold each row's text; `styles` optionally carries per-field inline formatting
 * (offsets into that field's text) authored in the Lexicon editor.
 */
export interface LexiconCardData {
  reference: string
  strong?: string
  summary?: string
  lemma: string
  partOfSpeech?: string
  transliteration?: string
  pronunciation?: string
  kjvUsage?: string
  wordOrigin?: string
  definition?: string
  isHebrew: boolean
  /**
   * Per-field inline styling (bold/italic/underline/color/highlight). Absent or
   * empty for a field means it renders on the plain, byte-identical path.
   */
  styles?: Partial<Record<LexiconField, StyledSpan[]>>
}
