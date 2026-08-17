import type { Verse } from "@/types"
import type { ScriptureScheduleItem } from "@/types/schedule"
import { verseReference } from "./verse-keys"

/**
 * Build a single-verse scripture schedule item from a verse + translation
 * abbreviation, at the given running-order position. Extracted from the
 * multi-add-to-schedule loop so the item shape (label / cached reference+text /
 * book-chapter-verse range) is defined once and unit-tested. The caller keeps the
 * insert-and-skip sequencing (only advancing `order` when an insert lands), so
 * `order` is passed in per item.
 */
export function buildScriptureScheduleItem(
  verse: Verse,
  translation: string,
  order: number
): ScriptureScheduleItem {
  const label = `${verseReference(verse)} (${translation})`
  return {
    id: crypto.randomUUID(),
    type: "scripture",
    label,
    order,
    notes: "",
    translationId: verse.translation_id,
    bookNumber: verse.book_number,
    chapter: verse.chapter,
    verseStart: verse.verse,
    verseEnd: verse.verse,
    cachedReference: label,
    cachedText: verse.text,
  }
}
