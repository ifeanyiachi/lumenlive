import type { Verse } from "@/types/bible"
import type { VerseRenderData } from "@/types/broadcast"
import type { ScriptureScheduleItem } from "@/types/schedule"
import type { StyledVerseSegment } from "@/types/verse-edit"
import { buildMultiVerseReference } from "@/lib/multi-verse"

/**
 * Item-scoped verse editing. A scripture schedule item stores its *own* styled
 * edits — a plain single/range item on `item.segments` (one per edited verse,
 * keyed by verse number), a collection on each cached verse's `segment`. Nothing
 * is written to a global store, so formatting a verse on one item never changes
 * the same verse on another item or in the Bible panel.
 *
 * PURE: no React / Zustand / Tauri — plain functions over the cached item data.
 */

/** The item's own styled edit for one verse of a plain item, if it has one. */
export function plainItemVerseSegment(
  item: ScriptureScheduleItem,
  verseNumber: number
): StyledVerseSegment | undefined {
  return item.segments?.find((s) => s.verseNumber === verseNumber)
}

/**
 * Render data for a plain item's combined range (`verseStart..verseEnd`),
 * applying the item's own per-verse edits where present and plain DB text
 * otherwise. Item-scoped by design: unlike {@link
 * import("@/lib/multi-verse").toMultiVerseRenderData} it never consults any
 * global edit store.
 */
export function rangeRenderDataForItem(
  item: ScriptureScheduleItem,
  verses: Verse[],
  translation: string
): VerseRenderData {
  const sorted = [...verses].sort((a, b) => {
    if (a.book_number !== b.book_number) return a.book_number - b.book_number
    if (a.chapter !== b.chapter) return a.chapter - b.chapter
    return a.verse - b.verse
  })
  return {
    reference: buildMultiVerseReference(sorted, translation),
    segments: sorted.map(
      (v) =>
        plainItemVerseSegment(item, v.verse) ?? {
          verseNumber: v.verse,
          text: v.text,
        }
    ),
  }
}
