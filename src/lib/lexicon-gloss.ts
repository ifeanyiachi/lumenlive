import type { OriginalWord } from "@/types"

/**
 * The English word shown on an interlinear word chip — the word's translation
 * *in context*, e.g. "God" for θεός / אֱלֹהִים.
 *
 * The backend aligns each original word to a word in the verse's English text
 * (`english_word`), which is the authoritative in-context translation for both
 * languages. When alignment finds nothing, Greek falls back to its clean
 * contextual gloss (STEPBible); Hebrew has no clean single-word fallback (its
 * gloss is the messy KJV-usage list), so it shows nothing rather than noise.
 */
export function chipEnglishWord(word: OriginalWord, isHebrew: boolean): string {
  if (word.english_word) return word.english_word.trim()
  if (!isHebrew) return (word.gloss ?? "").trim()
  return ""
}
