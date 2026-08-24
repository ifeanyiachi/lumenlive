import type { Verse } from "@/types/bible"
import type {
  ScriptureScheduleItem,
  ScriptureCollectionVerse,
} from "@/types/schedule"

/**
 * Pure helpers for scripture *collection* schedule items — the deck shape shared
 * by the schedule row's preview (schedule-all-tab) and the live presentation /
 * stepping path (schedule navigation slice). Keeping the deck math here (rather
 * than duplicated in a component and a store) means both walk the exact same
 * slide ordering: one slide per verse, in canonical order.
 *
 * PURE: no React / Zustand / Tauri — plain functions over the cached item data.
 */

/** True if `item` is a scripture collection with at least one cached verse. */
export function isScriptureCollection(item: ScriptureScheduleItem): boolean {
  return !!item.groupCollection && (item.collectionVerses?.length ?? 0) > 0
}

/**
 * Number of slides a collection expands into: one per cached verse. Returns 0
 * for a non-collection item (nothing to step).
 */
export function scriptureCollectionDeckLength(
  item: ScriptureScheduleItem
): number {
  return isScriptureCollection(item) ? (item.collectionVerses?.length ?? 0) : 0
}

/** Reconstruct a {@link Verse} from a cached collection verse (id is synthetic). */
export function collectionVerseToVerse(cv: ScriptureCollectionVerse): Verse {
  return {
    id: 0,
    translation_id: cv.translationId,
    book_number: cv.bookNumber,
    book_name: cv.bookName,
    book_abbreviation: cv.bookAbbreviation,
    chapter: cv.chapter,
    verse: cv.verse,
    text: cv.text,
  }
}

/** The cached collection verses reconstructed as {@link Verse}s, in order. */
export function scriptureCollectionVerses(
  item: ScriptureScheduleItem
): Verse[] {
  return (item.collectionVerses ?? []).map(collectionVerseToVerse)
}

/**
 * The cached collection verses as {@link Verse}s with **distinct** ids for the
 * multi-verse editor. {@link collectionVerseToVerse} gives every verse `id: 0`,
 * but that editor keys its per-verse TipTap instances by `verse.id` — leaving
 * the duplicate ids would collapse the whole collection onto a single editor
 * (and collide React keys). The id is display-only here (saved edits key on
 * translation/book/chapter/verse, not id), so a 1-based index is safe.
 */
export function scriptureCollectionEditVerses(
  item: ScriptureScheduleItem
): Verse[] {
  return scriptureCollectionVerses(item).map((v, i) => ({ ...v, id: i + 1 }))
}
