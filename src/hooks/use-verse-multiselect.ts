import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { bibleActions } from "@/hooks/use-bible"
import { useQueueStore, useBroadcastStore } from "@/stores"
import { useScheduleStore } from "@/stores/schedule-store"
import {
  toMultiVerseRenderData,
  buildMultiVerseReference,
} from "@/lib/multi-verse"
import { makeQueueItem } from "@/lib/search/queue-item"
import { buildScriptureScheduleItem } from "@/lib/search/schedule-items"
import { verseReference } from "@/lib/search/verse-keys"
import { toast } from "sonner"
import type { Verse, Translation } from "@/types"

/** Minimal surface of the quick-nav input the multiselect handlers write to. */
type QuickNavRef = React.RefObject<{ setValue: (text: string) => void } | null>

export interface UseVerseMultiselectArgs {
  /** The verses currently rendered (book-search chapter) — the selection domain. */
  currentChapter: Verse[]
  translations: Translation[]
  activeTranslationId: number
  quickNavRef: QuickNavRef
  /** Set the single-selected verse id (cleared on a range/toggle multi-select). */
  setSelectedVerseId: (id: number | null) => void
  /** Changing key (book:chapter) clears the multi-selection. */
  resetKey: string
}

/**
 * Book-search multi-verse selection (D4): ctrl/⌘-toggle + shift-range picking over
 * the current chapter, plus the group actions (present, queue as a group, add each
 * to the schedule) driven by the floating action bar. Context search has no
 * multiselect, so this stays book-only.
 *
 * The queue/schedule item shapes come from the shared `makeQueueItem` /
 * `buildScriptureScheduleItem` builders so a grouped queue add and a single add
 * stay in lockstep.
 */
export function useVerseMultiselect({
  currentChapter,
  translations,
  activeTranslationId,
  quickNavRef,
  setSelectedVerseId,
  resetKey,
}: UseVerseMultiselectArgs) {
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set())
  const lastClickedIdRef = useRef<number | null>(null)

  // Clear the selection when the book/chapter changes. Adjusted during render
  // (rather than in an effect) to avoid cascading renders.
  const [prevResetKey, setPrevResetKey] = useState(resetKey)
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    setMultiSelected(new Set())
  }
  // Reset the shift-click anchor (ref writes belong in an effect, not render).
  useEffect(() => {
    lastClickedIdRef.current = null
  }, [resetKey])

  const translationAbbr = useCallback(
    () =>
      translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
      "KJV",
    [translations, activeTranslationId]
  )

  const handleVerseClick = useCallback(
    (verse: Verse, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setMultiSelected((prev) => {
          const next = new Set(prev)
          if (next.has(verse.id)) {
            next.delete(verse.id)
          } else {
            next.add(verse.id)
          }
          return next
        })
        lastClickedIdRef.current = verse.id
        return
      }

      if (e.shiftKey && lastClickedIdRef.current !== null) {
        const startIdx = currentChapter.findIndex(
          (v) => v.id === lastClickedIdRef.current
        )
        const endIdx = currentChapter.findIndex((v) => v.id === verse.id)
        if (startIdx !== -1 && endIdx !== -1) {
          const from = Math.min(startIdx, endIdx)
          const to = Math.max(startIdx, endIdx)
          setMultiSelected((prev) => {
            const next = new Set(prev)
            for (let i = from; i <= to; i++) {
              next.add(currentChapter[i].id)
            }
            return next
          })
          return
        }
      }

      setMultiSelected(new Set())
      lastClickedIdRef.current = verse.id
      setSelectedVerseId(verse.id)
      bibleActions.selectVerse(verse)
      quickNavRef.current?.setValue(verseReference(verse))
    },
    [currentChapter, quickNavRef, setSelectedVerseId]
  )

  const multiSelectedVerses = useMemo(
    () => currentChapter.filter((v) => multiSelected.has(v.id)),
    [currentChapter, multiSelected]
  )

  const handleMultiPresent = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const renderData = toMultiVerseRenderData(
      multiSelectedVerses,
      translationAbbr()
    )
    useBroadcastStore.getState().setLiveVerse(renderData, "manual")
    if (multiSelectedVerses.length === 1) {
      bibleActions.selectVerse(multiSelectedVerses[0])
    }
  }, [multiSelectedVerses, translationAbbr])

  const handleMultiQueueGroup = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    useQueueStore.getState().addItem(
      makeQueueItem({
        verse: multiSelectedVerses[0],
        verses: multiSelectedVerses,
        reference: buildMultiVerseReference(
          multiSelectedVerses,
          translationAbbr()
        ),
        confidence: 1,
      })
    )
    setMultiSelected(new Set())
  }, [multiSelectedVerses, translationAbbr])

  const handleMultiAddToSchedule = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (!activeScheduleId) {
      toast.error("No active schedule — select or create one first")
      return
    }
    const schedule = scheduleStore.getActiveSchedule()
    const translation = translationAbbr()
    let insertAt =
      scheduleStore.activeItemIndex !== null
        ? scheduleStore.activeItemIndex + 1
        : (schedule?.items.length ?? 0)
    let added = 0
    for (const verse of multiSelectedVerses) {
      const item = buildScriptureScheduleItem(verse, translation, insertAt)
      if (scheduleStore.insertItemAt(activeScheduleId, item, insertAt)) {
        added++
        insertAt++
      }
    }
    const skipped = multiSelectedVerses.length - added
    if (added === 0) {
      toast.info(
        skipped > 1
          ? "Those verses are already in the schedule"
          : "Already in the schedule"
      )
    } else {
      toast.success(
        `${added} verse${added > 1 ? "s" : ""} added to schedule` +
          (skipped > 0 ? ` · ${skipped} already there` : "")
      )
    }
    setMultiSelected(new Set())
  }, [multiSelectedVerses, translationAbbr])

  const handleClearMultiSelect = useCallback(() => {
    setMultiSelected(new Set())
  }, [])

  return {
    multiSelected,
    setMultiSelected,
    multiSelectedVerses,
    handleVerseClick,
    handleMultiPresent,
    handleMultiQueueGroup,
    handleMultiAddToSchedule,
    handleClearMultiSelect,
  }
}
