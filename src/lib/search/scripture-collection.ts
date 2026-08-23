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
 * slide ordering: combined block first, then each verse individually.
 *
 * PURE: no React / Zustand / Tauri — plain functions over the cached item data.
 */

/** True if `item` is a scripture collection with at least one cached verse. */
export function isScriptureCollection(item: ScriptureScheduleItem): boolean {
  return !!item.groupCollection && (item.collectionVerses?.length ?? 0) > 0
}

/**
 * Number of slides a collection expands into: the combined block plus one per
 * cached verse. Returns 0 for a non-collection item (nothing to step).
 */
export function scriptureCollectionDeckLength(
  item: ScriptureScheduleItem
): number {
  return isScriptureCollection(item)
    ? 1 + (item.collectionVerses?.length ?? 0)
    : 0
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
