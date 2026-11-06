import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { bibleActions } from "@/hooks/use-bible"
import { toVerseRenderData } from "@/hooks/use-broadcast"
import { useBroadcastStore } from "@/stores"
import { useScheduleStore } from "@/stores/schedule-store"
import { toMultiVerseRenderData } from "@/lib/multi-verse"
import {
  buildScriptureScheduleItem,
  buildGroupedScriptureScheduleItem,
  buildScriptureCollectionScheduleItem,
} from "@/lib/search/schedule-items"
import { verseReference } from "@/lib/search/verse-keys"
import { toast } from "sonner"
import { i18n } from "@/lib/i18n/config"
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
 * the current chapter, plus the group actions driven by the floating action bar:
 * present the block straight to the audience, add the whole selection as one
 * grouped schedule item, or add each verse individually. Context search has no
 * multiselect, so this stays book-only.
 *
 * The schedule item shapes come from the shared `buildScriptureScheduleItem` /
 * `buildGroupedScriptureScheduleItem` builders so the individual add and the
 * grouped add stay in lockstep.
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
      // Stage the picked verse as a pending take: `selectVerse` →
      // `followManualSelection()` has just dropped any queue/schedule pin AND
      // `previewPending`, so without this the verse previews (via the Bible-
      // selection fallback) but the Go Live button stays disabled — the operator
      // can see it but can't push it to the audience. Staging arms Go Live and
      // gives `takeToLive` a concrete verse to commit (no null-verse hazard).
      useBroadcastStore
        .getState()
        .setLiveVerse(toVerseRenderData(verse, translationAbbr()))
    },
    [currentChapter, quickNavRef, setSelectedVerseId, translationAbbr]
  )

  // Double-click / double-tap is the express path: stage the verse and send it
  // straight to the audience in one gesture, skipping the preview → Go Live
  // two-step. Ensures the output is on air first, so the verse actually reaches
  // the live output even when the operator hadn't gone live yet.
  const handleVerseDoubleClick = useCallback(
    (verse: Verse) => {
      setMultiSelected(new Set())
      lastClickedIdRef.current = verse.id
      setSelectedVerseId(verse.id)
      bibleActions.selectVerse(verse)
      quickNavRef.current?.setValue(verseReference(verse))
      const broadcast = useBroadcastStore.getState()
      broadcast.setLiveVerse(toVerseRenderData(verse, translationAbbr()))
      if (!broadcast.isLive) broadcast.setLive(true)
      broadcast.takeToLive()
    },
    [quickNavRef, setSelectedVerseId, translationAbbr]
  )

  const multiSelectedVerses = useMemo(
    () => currentChapter.filter((v) => multiSelected.has(v.id)),
    [currentChapter, multiSelected]
  )

  // Present the whole selection straight to the audience: stage it into the
  // Program preview and push it live in one action (bypassing the operator's
  // take-to-live gate), so the block shows on the live output and the preview
  // together. Stage under the "queue" source — the generic "staged verse block"
  // source (see presentQueueVerse / presentDetectionLive) — so the Program
  // preview pins to the whole block instead of falling back to the single Bible
  // selection, which can't represent a multi-verse group. A later manual verse
  // pick releases the pin via followManualSelection (see bibleActions.selectVerse).
  const handleMultiPresent = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const renderData = toMultiVerseRenderData(
      multiSelectedVerses,
      translationAbbr()
    )
    const broadcast = useBroadcastStore.getState()
    broadcast.setLiveVerse(renderData, "queue")
    broadcast.takeToLive()
    if (multiSelectedVerses.length === 1) {
      bibleActions.selectVerse(multiSelectedVerses[0])
    }
  }, [multiSelectedVerses, translationAbbr])

  // Add the whole selection to the running order as a single grouped scripture
  // item — straight into the schedule, never the AI verse queue.
  const handleMultiAddGroupToSchedule = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (!activeScheduleId) {
      toast.error(i18n.t("schedule:toast.noActiveSchedule"))
      return
    }
    const schedule = scheduleStore.getActiveSchedule()
    const insertAt =
      scheduleStore.activeItemIndex !== null
        ? scheduleStore.activeItemIndex + 1
        : (schedule?.items.length ?? 0)
    const item = buildGroupedScriptureScheduleItem(
      multiSelectedVerses,
      translationAbbr(),
      insertAt
    )
    if (scheduleStore.insertItemAt(activeScheduleId, item, insertAt)) {
      toast.success(
        i18n.t("schedule:toast.verseGroupAdded", {
          count: multiSelectedVerses.length,
        })
      )
    } else {
      toast.info(i18n.t("schedule:toast.alreadyInSchedule"))
    }
    setMultiSelected(new Set())
  }, [multiSelectedVerses, translationAbbr])

  // Add the whole selection as a single *collection* item — one running-order
  // entry that expands into a dropdown deck: the combined block first, then each
  // verse individually (mirroring how a song / grouped slide deck expands).
  const handleMultiAddAsGroup = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (!activeScheduleId) {
      toast.error(i18n.t("schedule:toast.noActiveSchedule"))
      return
    }
    const schedule = scheduleStore.getActiveSchedule()
    const insertAt =
      scheduleStore.activeItemIndex !== null
        ? scheduleStore.activeItemIndex + 1
        : (schedule?.items.length ?? 0)
    const item = buildScriptureCollectionScheduleItem(
      multiSelectedVerses,
      translationAbbr(),
      insertAt
    )
    if (scheduleStore.insertItemAt(activeScheduleId, item, insertAt)) {
      toast.success(
        i18n.t("schedule:toast.verseGroupAdded", {
          count: multiSelectedVerses.length,
        })
      )
    } else {
      toast.info(i18n.t("schedule:toast.alreadyInSchedule"))
    }
    setMultiSelected(new Set())
  }, [multiSelectedVerses, translationAbbr])

  const handleMultiAddToSchedule = useCallback(() => {
    if (multiSelectedVerses.length === 0) return
    const scheduleStore = useScheduleStore.getState()
    const activeScheduleId = scheduleStore.activeScheduleId
    if (!activeScheduleId) {
      toast.error(i18n.t("schedule:toast.noActiveSchedule"))
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
          ? i18n.t("schedule:toast.versesAlreadyInSchedule")
          : i18n.t("schedule:toast.alreadyInSchedule")
      )
    } else {
      toast.success(
        i18n.t("schedule:toast.versesAdded", {
          count: added,
          skippedSuffix:
            skipped > 0
              ? i18n.t("schedule:toast.skipped", { count: skipped })
              : "",
        })
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
    handleVerseDoubleClick,
    handleMultiPresent,
    handleMultiAddGroupToSchedule,
    handleMultiAddAsGroup,
    handleMultiAddToSchedule,
    handleClearMultiSelect,
  }
}
