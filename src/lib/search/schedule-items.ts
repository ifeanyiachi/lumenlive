import type { Verse } from "@/types"
import type {
  ScriptureScheduleItem,
  ScriptureCollectionVerse,
} from "@/types/schedule"
import type { StyledVerseSegment } from "@/types/verse-edit"
import { verseReference } from "./verse-keys"
import { buildMultiVerseReference } from "@/lib/multi-verse"

/** Sort verses into canonical (book → chapter → verse) order without mutating. */
function sortCanonical(verses: Verse[]): Verse[] {
  return [...verses].sort((a, b) => {
    if (a.book_number !== b.book_number) return a.book_number - b.book_number
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })
}

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
  order: number,
  /** Item-scoped styled edit for this verse (owned by the item, never global). */
  segment?: StyledVerseSegment
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
    cachedText: segment?.text ?? verse.text,
    ...(segment ? { segments: [segment] } : {}),
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
  order: number,
  /** verse.id → its item-scoped styled edit; only edited verses need be present. */
  segmentById?: Map<number, StyledVerseSegment>
): ScriptureScheduleItem {
  const sorted = sortCanonical(verses)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const reference = buildMultiVerseReference(sorted, translation)
  const segments = sorted
    .map((v) => segmentById?.get(v.id))
    .filter((s): s is StyledVerseSegment => !!s)
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
    cachedText: sorted
      .map((v) => segmentById?.get(v.id)?.text ?? v.text)
      .join(" "),
    ...(segments.length > 0 ? { segments } : {}),
  }
}

/**
 * Build a scripture *collection* item: one running-order entry that expands into
 * a deck of one slide per verse (mirroring how a song / grouped slide deck
 * expands). The top-level fields carry the combined range — reusing {@link
 * buildGroupedScriptureScheduleItem} for the label / reference / cached text —
 * and each selected verse is cached in `collectionVerses` so the deck renders
 * offline and survives a reload.
 */
export function buildScriptureCollectionScheduleItem(
  verses: Verse[],
  translation: string,
  order: number,
  /** verse.id → its item-scoped styled edit; only edited verses need be present. */
  segmentById?: Map<number, StyledVerseSegment>
): ScriptureScheduleItem {
  const base = buildGroupedScriptureScheduleItem(
    verses,
    translation,
    order,
    segmentById
  )
  const sorted = sortCanonical(verses)
  const collectionVerses: ScriptureCollectionVerse[] = sorted.map((v) => {
    const segment = segmentById?.get(v.id)
    return {
      translationId: v.translation_id,
      bookNumber: v.book_number,
      bookName: v.book_name,
      bookAbbreviation: v.book_abbreviation,
      chapter: v.chapter,
      verse: v.verse,
      text: segment?.text ?? v.text,
      reference: `${verseReference(v)} (${translation})`,
      ...(segment ? { segment } : {}),
    }
  })
  // A collection carries its edits per-verse (on collectionVerses); the top-level
  // combined `segments` from the grouped base would double-store them.
  const { segments: _combined, ...rest } = base
  return { ...rest, groupCollection: true, collectionVerses }
}
