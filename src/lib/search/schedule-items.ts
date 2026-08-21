import type { Verse } from "@/types"
import type { ScriptureScheduleItem } from "@/types/schedule"
import { verseReference } from "./verse-keys"
import { buildMultiVerseReference } from "@/lib/multi-verse"

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

/**
 * Build a single *grouped* scripture schedule item spanning a multi-verse
 * selection — the whole block lands as one running-order entry (mirroring the
 * multi-select bar's "Add group to Schedule"), rather than one item per verse.
 * Verses are sorted so the range and cached text read in canonical order; the
 * item's book/chapter/verseStart come from the first verse and verseEnd from the
 * last (a selection spanning chapters collapses to the first verse's chapter, as
 * the schedule item shape carries a single chapter). `cachedText` is the plain
 * verse text joined — verse-edit formatting is applied at render time, not here.
 */
export function buildGroupedScriptureScheduleItem(
  verses: Verse[],
  translation: string,
  order: number
): ScriptureScheduleItem {
  const sorted = [...verses].sort((a, b) => {
    if (a.book_number !== b.book_number) return a.book_number - b.book_number
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const reference = buildMultiVerseReference(sorted, translation)
  return {
    id: crypto.randomUUID(),
    type: "scripture",
    label: reference,
    order,
    notes: "",
    translationId: first.translation_id,
    bookNumber: first.book_number,
    chapter: first.chapter,
    verseStart: first.verse,
    verseEnd: last.verse,
    cachedReference: reference,
    cachedText: sorted.map((v) => v.text).join(" "),
  }
}
