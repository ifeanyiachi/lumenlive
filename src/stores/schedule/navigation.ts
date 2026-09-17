import type { StateCreator } from "zustand"
import { invoke } from "@tauri-apps/api/core"
import type {
  ScriptureScheduleItem,
  SlideScheduleItem,
  MediaScheduleItem,
  WebScheduleItem,
  SongScheduleItem,
  LexiconScheduleItem,
} from "@/types/schedule"
import type { Verse } from "@/types/bible"
import { useBroadcastStore } from "@/stores/broadcast-store"
import {
  toVerseRenderData,
  presentSlide,
  presentMedia,
  presentWeb,
} from "@/hooks/use-broadcast"
import { usePresentationStore } from "@/stores/presentation-store"
import { useMediaStore } from "@/stores/media-store"
import { useSongStore } from "@/stores/song-store"
import { rangeRenderDataForItem } from "@/lib/verse-edit/item-segments"
import type { StyledVerseSegment } from "@/types/verse-edit"
import { bibleActions } from "@/hooks/use-bible"
import { useBibleStore } from "@/stores/bible-store"
import {
  isScriptureCollection,
  scriptureCollectionDeckLength,
} from "@/lib/search/scripture-collection"
import { deckForSongItem, setStageNotesForItem } from "./internals"
import type { ScheduleState } from "./types"

/**
 * Present a single scripture verse to the Program preview — the shared body of
 * the plain single-verse item and each individual slide of a scripture
 * *collection*. Fetches the verse fresh (so live output reflects the current DB
 * text) and applies the item's *own* styled edit when one is passed (`segment`);
 * edits are item-scoped, so nothing is read from a global store. Stages under the
 * "schedule" source.
 */
async function presentSingleScriptureVerse(
  translationId: number,
  bookNumber: number,
  chapter: number,
  verseNumber: number,
  abbr: string,
  segment?: StyledVerseSegment
): Promise<void> {
  const verse = await invoke<Verse | null>("get_verse", {
    translationId,
    bookNumber,
    chapter,
    verse: verseNumber,
  })
  if (!verse) return
  useBibleStore.getState().selectVerse(verse)
  if (bookNumber > 0) {
    // Update the book search to show the verse, but don't grab keyboard focus —
    // the arrow keys must stay with the schedule list.
    bibleActions.navigateToVerse(bookNumber, chapter, verseNumber, false)
  }
  const renderData = toVerseRenderData(
    verse,
    abbr,
    undefined,
    segment ? [segment] : undefined
  )
  useBroadcastStore.getState().setLiveVerse(renderData, "schedule")
}

/**
 * Schedule navigation and presentation: staging items into the Program preview
 * (`goToItem`), stepping (`nextItem`/`prevItem`), going live (`presentLive`),
 * and the per-item presentation dispatch (`presentItem`). Owns the live-cursor
 * fields (`activeItemIndex`, `activeSlideIndex`, `activeSongDeck`). This slice
 * pulls in the most other stores — bible, presentation, media, song, verse-edit.
 */
export type NavigationSlice = Pick<
  ScheduleState,
  | "activeItemIndex"
  | "activeSlideIndex"
  | "activeSongDeck"
  | "goToItem"
  | "nextItem"
  | "prevItem"
  | "goToAdjacentItem"
  | "presentLive"
  | "presentItemSlideLive"
  | "presentItem"
  | "stepSlideByVoice"
>

export const createNavigationSlice: StateCreator<
  ScheduleState,
  [],
  [],
  NavigationSlice
> = (set, get) => ({
  activeItemIndex: null,
  activeSlideIndex: null,
  activeSongDeck: null,

  goToItem: async (index) => {
    const schedule = get().getActiveSchedule()
    if (!schedule || index < 0 || index >= schedule.items.length) return
    const item = schedule.items[index]

    let activeSlideIndex: number | null = null
    let activeSongDeck: ScheduleState["activeSongDeck"] = null
    if (item.type === "slide") {
      activeSlideIndex = item.slideIndex
    } else if (item.type === "scripture" && isScriptureCollection(item)) {
      // Start a collection at its first verse (index 0).
      activeSlideIndex = 0
    } else if (item.type === "song") {
      // Generate once at go-live so verse stepping reuses a stable deck and the
      // lyrics reflect any edits made up to this moment.
      const deck = deckForSongItem(item)
      activeSongDeck = deck ? { itemId: item.id, deck } : null
      activeSlideIndex = deck && deck.slides.length > 0 ? 0 : null
      // Log usage once per go-live for the CCLI report.
      const song = useSongStore
        .getState()
        .songs.find((s) => s.id === item.songId)
      if (song) {
        useSongStore.getState().recordSongUsage(song, schedule.name)
      }
    }

    set({
      activeItemIndex: index,
      activeSlideIndex,
      selectedItemId: item.id,
      activeSongDeck,
    })
    const staged = get().presentItem(item)
    setStageNotesForItem(item)
    return staged
  },

  goToAdjacentItem: (delta) => {
    const schedule = get().getActiveSchedule()
    if (!schedule || delta === 0) return
    const items = schedule.items
    const current = get().activeItemIndex
    const step = delta > 0 ? 1 : -1
    // With nothing active yet, ↓/next starts at the top and ↑/prev at the
    // bottom, matching the previous inline arrow-key behaviour.
    let idx =
      current === null ? (step > 0 ? 0 : items.length - 1) : current + step
    while (idx >= 0 && idx < items.length && items[idx].type === "header") {
      idx += step
    }
    if (idx >= 0 && idx < items.length) void get().goToItem(idx)
  },

  presentLive: async (index) => {
    const schedule = get().getActiveSchedule()
    if (!schedule || index < 0 || index >= schedule.items.length) return
    // Stage into the Program preview first, then push that staged item to the
    // audience — the only path to live from the schedule.
    await get().goToItem(index)
    useBroadcastStore.getState().takeToLive()
  },

  presentItemSlideLive: async (index, slideIndex) => {
    const schedule = get().getActiveSchedule()
    if (!schedule || index < 0 || index >= schedule.items.length) return
    const item = schedule.items[index]
    if (item.type === "header") return
    // The sub-item equivalent of `presentLive`, for a double-tap on an expanded
    // deck row (grouped slides, songs, scripture collections). `goToItem` stages
    // the parent item and resets `activeSlideIndex` to the deck's default, so we
    // override to the double-tapped sub-slide and re-stage into the Program
    // preview *before* taking it to the audience — otherwise the wrong slide
    // would go live.
    await get().goToItem(index)
    set({ activeSlideIndex: slideIndex })
    await get().presentItem(item)
    useBroadcastStore.getState().takeToLive()
  },

  nextItem: () => {
    const schedule = get().getActiveSchedule()
    if (!schedule) return
    const current = get().activeItemIndex
    if (current !== null) {
      const item = schedule.items[current]
      if (item?.type === "slide") {
        const si = item as SlideScheduleItem
        const pres = usePresentationStore
          .getState()
          .presentations.find((p) => p.id === si.presentationId)
        const slideIdx = get().activeSlideIndex ?? si.slideIndex
        if (pres && slideIdx < pres.slides.length - 1) {
          const next = slideIdx + 1
          set({ activeSlideIndex: next })
          void get().presentItem(item)
          setStageNotesForItem(item)
          return
        }
      } else if (item?.type === "scripture" && isScriptureCollection(item)) {
        const len = scriptureCollectionDeckLength(item)
        const slideIdx = get().activeSlideIndex ?? 0
        if (slideIdx < len - 1) {
          set({ activeSlideIndex: slideIdx + 1 })
          void get().presentItem(item)
          setStageNotesForItem(item)
          return
        }
      } else if (item?.type === "song") {
        // Reuse the cached deck when it matches, else regenerate — mirroring
        // presentItem. Without the fallback, a song whose
        // deck cache is empty (e.g. active item restored without its transient
        // deck) can't step and wrongly skips to the next schedule item.
        const cached = get().activeSongDeck
        const deck =
          cached?.itemId === item.id ? cached.deck : deckForSongItem(item)
        const slideIdx = get().activeSlideIndex ?? 0
        if (deck && slideIdx < deck.slides.length - 1) {
          const next = slideIdx + 1
          set({
            activeSlideIndex: next,
            activeSongDeck: { itemId: item.id, deck },
          })
          void get().presentItem(item)
          setStageNotesForItem(item)
          return
        }
      }
    }
    let next = current === null ? 0 : current + 1
    while (
      next < schedule.items.length &&
      schedule.items[next].type === "header"
    ) {
      next++
    }
    if (next < schedule.items.length) void get().goToItem(next)
  },

  prevItem: () => {
    const schedule = get().getActiveSchedule()
    if (!schedule) return
    const current = get().activeItemIndex
    if (current === null) return
    const item = schedule.items[current]
    if (item?.type === "slide") {
      const si = item as SlideScheduleItem
      const slideIdx = get().activeSlideIndex ?? si.slideIndex
      if (slideIdx > 0) {
        const newIdx = slideIdx - 1
        set({ activeSlideIndex: newIdx })
        void get().presentItem(item)
        setStageNotesForItem(item)
        return
      }
    } else if (item?.type === "scripture" && isScriptureCollection(item)) {
      const slideIdx = get().activeSlideIndex ?? 0
      if (slideIdx > 0) {
        set({ activeSlideIndex: slideIdx - 1 })
        void get().presentItem(item)
        setStageNotesForItem(item)
        return
      }
    } else if (item?.type === "song") {
      const slideIdx = get().activeSlideIndex ?? 0
      if (slideIdx > 0) {
        const newIdx = slideIdx - 1
        set({ activeSlideIndex: newIdx })
        void get().presentItem(item)
        setStageNotesForItem(item)
        return
      }
    }
    if (current <= 0) return
    let prev = current - 1
    while (prev >= 0 && schedule.items[prev].type === "header") {
      prev--
    }
    if (prev >= 0) {
      const prevItem = schedule.items[prev]
      if (prevItem?.type === "slide") {
        const si = prevItem as SlideScheduleItem
        const pres = usePresentationStore
          .getState()
          .presentations.find((p) => p.id === si.presentationId)
        if (pres && pres.slides.length > 0) {
          const lastSlide = pres.slides.length - 1
          set({
            activeItemIndex: prev,
            activeSlideIndex: lastSlide,
            selectedItemId: prevItem.id,
            activeSongDeck: null,
          })
          void get().presentItem(prevItem)
          setStageNotesForItem(prevItem)
          return
        }
      } else if (
        prevItem?.type === "scripture" &&
        isScriptureCollection(prevItem)
      ) {
        // Stepping back into a collection lands on its last slide.
        set({
          activeItemIndex: prev,
          activeSlideIndex: scriptureCollectionDeckLength(prevItem) - 1,
          selectedItemId: prevItem.id,
          activeSongDeck: null,
        })
        void get().presentItem(prevItem)
        setStageNotesForItem(prevItem)
        return
      } else if (prevItem?.type === "song") {
        const deck = deckForSongItem(prevItem)
        if (deck && deck.slides.length > 0) {
          const lastSlide = deck.slides.length - 1
          set({
            activeItemIndex: prev,
            activeSlideIndex: lastSlide,
            selectedItemId: prevItem.id,
            activeSongDeck: { itemId: prevItem.id, deck },
          })
          void get().presentItem(prevItem)
          setStageNotesForItem(prevItem)
          return
        }
      }
      void get().goToItem(prev)
    }
  },

  stepSlideByVoice: async (direction, count, goLive) => {
    const schedule = get().getActiveSchedule()
    if (!schedule) return
    // Anchor on the currently active item: nextItem()/prevItem() each resolve
    // against activeItemIndex/activeSlideIndex, so the spoken "next slide" steps
    // whatever is live regardless of how it became active (arrow key, click,
    // Go Live, or a prior voice command). Rust carries intent only; the target
    // is resolved here.
    const steps = Math.max(1, Math.floor(count))
    for (let i = 0; i < steps; i++) {
      if (direction === "next") get().nextItem()
      else get().prevItem()
    }
    if (!goLive) return
    // nextItem()/prevItem() stage the active slide with a fire-and-forget
    // presentItem(). Before pushing to the audience, re-stage the final active
    // item and await it so the Program preview holds the correct slide — else
    // takeToLive() could commit stale or still-in-flight staged content.
    const idx = get().activeItemIndex
    if (idx === null) return
    const item = schedule.items[idx]
    if (!item || item.type === "header") return
    await get().presentItem(item)
    useBroadcastStore.getState().takeToLive()
  },

  presentItem: async (item) => {
    switch (item.type) {
      case "scripture": {
        const si = item as ScriptureScheduleItem
        useBroadcastStore.setState({ broadcastSource: "schedule" })
        const abbr =
          useBibleStore
            .getState()
            .translations.find((t) => t.id === si.translationId)
            ?.abbreviation ??
          si.cachedReference.match(/\(([^)]+)\)/)?.[1] ??
          "KJV"
        try {
          if (isScriptureCollection(si)) {
            // Collection deck: one slide per verse (no combined block). Each verse
            // carries its own item-scoped styled edit on `cv.segment`.
            const idx = get().activeSlideIndex ?? 0
            const cv = si.collectionVerses![idx]
            if (cv) {
              await presentSingleScriptureVerse(
                cv.translationId,
                cv.bookNumber,
                cv.chapter,
                cv.verse,
                abbr,
                cv.segment
              )
            }
            break
          }
          if (si.verseEnd > si.verseStart) {
            // Grouped range: render the whole block, applying the item's own
            // per-verse edits (item-scoped, never a global store). Without this a
            // range item would only ever show its first verse.
            const chapter = await invoke<Verse[]>("get_chapter", {
              translationId: si.translationId,
              bookNumber: si.bookNumber,
              chapter: si.chapter,
            })
            const range = chapter.filter(
              (v) => v.verse >= si.verseStart && v.verse <= si.verseEnd
            )
            if (range.length > 0) {
              useBibleStore.getState().selectVerse(range[0])
              if (si.bookNumber > 0) {
                bibleActions.navigateToVerse(
                  si.bookNumber,
                  si.chapter,
                  si.verseStart,
                  false
                )
              }
              const renderData = rangeRenderDataForItem(si, range, abbr)
              useBroadcastStore.getState().setLiveVerse(renderData, "schedule")
            }
            break
          }
          await presentSingleScriptureVerse(
            si.translationId,
            si.bookNumber,
            si.chapter,
            si.verseStart,
            abbr,
            si.segments?.find((s) => s.verseNumber === si.verseStart)
          )
        } catch {
          console.warn("[schedule] Failed to present scripture item")
        }
        break
      }
      case "slide": {
        const si = item as SlideScheduleItem
        const pres = usePresentationStore
          .getState()
          .presentations.find((p) => p.id === si.presentationId)
        if (!pres || pres.slides.length === 0) break
        const raw = get().activeSlideIndex ?? si.slideIndex
        const idx = Math.min(raw, pres.slides.length - 1)
        if (idx !== raw) set({ activeSlideIndex: idx })
        const slide = pres.slides[idx]
        if (slide) await presentSlide(slide)
        break
      }
      case "media": {
        const mi = item as MediaScheduleItem
        const playback = {
          trimStart: mi.trimStart,
          trimEnd: mi.trimEnd,
          loop: mi.loop,
          endAction: mi.endAction,
          markers: mi.markers,
          fit: mi.fit,
          zoom: mi.zoom,
          focalX: mi.focalX,
          focalY: mi.focalY,
          containBackground: mi.containBackground,
          containBackgroundColor: mi.containBackgroundColor,
        }
        const asset = useMediaStore
          .getState()
          .assets.find((a) => a.id === mi.mediaAssetId)
        if (asset) {
          await presentMedia(asset, playback)
        } else if (mi.cachedFilePath && mi.cachedMediaType) {
          await presentMedia(
            {
              id: mi.mediaAssetId,
              name: mi.label,
              type: mi.cachedMediaType,
              filePath: mi.cachedFilePath,
              fileSize: 0,
              tags: [],
              addedAt: 0,
            },
            playback
          )
        }
        break
      }
      case "web": {
        const wi = item as WebScheduleItem
        if (wi.url) await presentWeb(wi)
        break
      }
      case "song": {
        const si = item as SongScheduleItem
        const cached = get().activeSongDeck
        const deck =
          cached?.itemId === si.id ? cached.deck : deckForSongItem(si)
        if (!deck || deck.slides.length === 0) break
        const raw = get().activeSlideIndex ?? 0
        const idx = Math.min(Math.max(0, raw), deck.slides.length - 1)
        if (idx !== raw) set({ activeSlideIndex: idx })
        await presentSlide(deck.slides[idx])
        break
      }
      case "lexicon": {
        // The card is carried inline on the item, so it presents through the
        // same slide pipeline as Go Live — the Lexical Summary, not the verse.
        await presentSlide((item as LexiconScheduleItem).slide)
        break
      }
      case "header":
        break
    }
  },
})
