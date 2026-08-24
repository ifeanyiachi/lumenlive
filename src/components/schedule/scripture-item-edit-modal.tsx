import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MultiVerseEditModal } from "@/components/verse-edit/multi-verse-edit-modal"
import { fetchChapter } from "@/services/bible-search-gateway"
import { useBibleStore } from "@/stores/bible-store"
import { useScheduleStore } from "@/stores/schedule-store"
import {
  isScriptureCollection,
  scriptureCollectionEditVerses,
} from "@/lib/search/scripture-collection"
import type {
  ScriptureScheduleItem,
  ScriptureCollectionVerse,
} from "@/types/schedule"
import type { StyledVerseSegment } from "@/types/verse-edit"
import type { Verse } from "@/types/bible"

/**
 * Resolve the individual verses a scripture schedule item edits. A *collection*
 * (grouped multi-select) uses its cached verses — no DB hit — while a plain
 * single/range item fetches its chapter so each verse's live text and metadata
 * are exact. Cached collection verses all carry `id: 0`, so they're reindexed:
 * the multi-verse editor keys its editors by `verse.id` and would otherwise
 * collapse every verse onto one editor.
 */
async function loadScriptureItemVerses(
  item: ScriptureScheduleItem
): Promise<Verse[]> {
  if (isScriptureCollection(item)) {
    return scriptureCollectionEditVerses(item)
  }
  try {
    const chapter = await fetchChapter(
      item.translationId,
      item.bookNumber,
      item.chapter
    )
    const range = chapter.filter(
      (v) => v.verse >= item.verseStart && v.verse <= item.verseEnd
    )
    if (range.length > 0) return range
  } catch {
    // Fall through to the cached single-verse fallback below.
  }
  // Fallback: reconstruct a single verse from the item's cache (offline / DB
  // miss). Book metadata is best-effort — the reference stays correct either way.
  const book = useBibleStore
    .getState()
    .books.find((b) => b.book_number === item.bookNumber)
  return [
    {
      id: 1,
      translation_id: item.translationId,
      book_number: item.bookNumber,
      book_name: book?.name ?? item.cachedReference.replace(/\s+\d+:.*$/, ""),
      book_abbreviation: book?.abbreviation ?? "",
      chapter: item.chapter,
      verse: item.verseStart,
      text: item.cachedText,
    },
  ]
}

/** The item's own stored edit for a verse (collection verse or plain range). */
function storedSegmentFor(
  item: ScriptureScheduleItem,
  verse: Verse
): StyledVerseSegment | undefined {
  if (isScriptureCollection(item)) {
    return item.collectionVerses?.find(
      (cv) => cv.chapter === verse.chapter && cv.verse === verse.verse
    )?.segment
  }
  return item.segments?.find((s) => s.verseNumber === verse.verse)
}

/**
 * Edit the verses of an existing scripture schedule item in place. Reuses the
 * multi-verse editor (which handles a single verse as well as a grouped
 * collection) so one path covers plain items, ranges, and collections. The edits
 * are stored **on this item only** — a collection on each cached verse's
 * `segment`, a plain item on `item.segments` — never in any global store, so the
 * same verse elsewhere is untouched. Editing without saving discards the change.
 */
export function ScriptureItemEditModal({
  open,
  onOpenChange,
  item,
  scheduleId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: ScriptureScheduleItem | null
  scheduleId: string
}) {
  const translations = useBibleStore((s) => s.translations)
  // Keyed by item id so verses from a previous item are never shown against a
  // newly-opened one (the async load resolves after the item prop changes).
  const [loaded, setLoaded] = useState<{
    itemId: string
    verses: Verse[]
  } | null>(null)

  useEffect(() => {
    if (!open || !item) return
    let cancelled = false
    loadScriptureItemVerses(item).then((verses) => {
      if (!cancelled) setLoaded({ itemId: item.id, verses })
    })
    return () => {
      cancelled = true
    }
  }, [open, item])

  if (!item || loaded?.itemId !== item.id || loaded.verses.length === 0)
    return null
  const verses = loaded.verses

  const abbr =
    translations.find((t) => t.id === item.translationId)?.abbreviation ??
    item.cachedReference.match(/\(([^)]+)\)/)?.[1] ??
    "KJV"

  return (
    <MultiVerseEditModal
      open={open}
      onOpenChange={onOpenChange}
      verses={verses}
      translationAbbreviation={abbr}
      initialSegmentFor={(verse) => storedSegmentFor(item, verse)}
      onSave={({ renderData, segmentById }) => {
        const cachedText = renderData.segments.map((s) => s.text).join(" ")
        const updates: Partial<ScriptureScheduleItem> = { cachedText }
        if (isScriptureCollection(item) && item.collectionVerses) {
          // editVerses[i].id === i + 1 (see scriptureCollectionEditVerses), so
          // the map lines up with collectionVerses index-for-index.
          const collectionVerses: ScriptureCollectionVerse[] =
            item.collectionVerses.map((cv, i) => {
              const segment = segmentById.get(i + 1)
              return segment ? { ...cv, segment } : { ...cv, segment: undefined }
            })
          updates.collectionVerses = collectionVerses
        } else {
          const segments = Array.from(segmentById.values())
          updates.segments = segments.length > 0 ? segments : undefined
        }
        useScheduleStore.getState().updateItem(scheduleId, item.id, updates)
        toast.success("Verse edits saved")
      }}
    />
  )
}
