import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import { invoke } from "@tauri-apps/api/core"
import type {
  ServiceSchedule,
  ScheduleItem,
  ScriptureScheduleItem,
  SlideScheduleItem,
  MediaScheduleItem,
  WebScheduleItem,
  SongScheduleItem,
  LexiconScheduleItem,
} from "@/types/schedule"
import { createDefaultSchedule, scheduleItemKey } from "@/types/schedule"
import { useBroadcastStore } from "@/stores/broadcast-store"
import {
  toVerseRenderData,
  presentSlide,
  presentMedia,
  presentWeb,
} from "@/hooks/use-broadcast"
import type { Verse } from "@/types/bible"
import type { Presentation } from "@/types/slide"
import { usePresentationStore } from "@/stores/presentation-store"
import { useMediaStore } from "@/stores/media-store"
import { useSongStore } from "@/stores/song-store"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { useVerseEditStore } from "@/stores/verse-edit-store"
import { verseEditKey } from "@/types/verse-edit"
import { bibleActions } from "@/hooks/use-bible"
import { useBibleStore } from "@/stores/bible-store"
import { useSettingsStore } from "@/stores/settings-store"

/**
 * Generate the lyric deck for a song schedule item from the *current* song
 * content — resolving its arrangement (item override → default) and projection
 * options (global defaults ← per-song override ← per-item theme). Returns null if
 * the song or an arrangement no longer exists. Called at go-live and when staging
 * a song for preview, so lyric edits made beforehand are always reflected.
 */
function deckForSongItem(item: SongScheduleItem): Presentation | null {
  const song = useSongStore.getState().songs.find((s) => s.id === item.songId)
  if (!song) return null
  const arrangement =
    (item.arrangementId
      ? song.arrangements.find((a) => a.id === item.arrangementId)
      : undefined) ??
    song.arrangements.find((a) => a.isDefault) ??
    song.arrangements[0]
  if (!arrangement) return null
  const base = resolveSongSlideOptions(
    useSettingsStore.getState().songSlideDefaults,
    song.slideOptions
  )
  const options = item.themeId ? { ...base, themeId: item.themeId } : base
  return generateSlidesFromSong(song, arrangement, options)
}

/** Options shared by the item-adding actions. */
export interface AddItemOptions {
  /**
   * Reject the item when the schedule already contains one with the same
   * content, flash-highlighting the existing row instead. Defaults to the
   * user's `preventDuplicateScheduleItems` setting; pass `false` to force the
   * item through regardless — used for placeholders the user is about to
   * configure, which are not yet meaningfully "the same" as anything.
   */
  dedupe?: boolean
}

function shouldDedupe(opts?: AddItemOptions): boolean {
  return (
    opts?.dedupe ?? useSettingsStore.getState().preventDuplicateScheduleItems
  )
}

interface ScheduleState {
  schedules: ServiceSchedule[]
  activeScheduleId: string | null
  activeItemIndex: number | null
  activeSlideIndex: number | null
  selectedItemId: string | null
  /** ID of the schedule item currently being flash-highlighted (null = none). */
  highlightedId: string | null
  /**
   * Transient (never persisted) cache of the deck generated for the live song
   * item, so stepping through its verses reuses one deck (stable ids) instead of
   * regenerating per step. Cleared whenever a non-song item goes live.
   */
  activeSongDeck: { itemId: string; deck: Presentation } | null

  createSchedule: (name?: string) => string
  deleteSchedule: (id: string) => void
  renameSchedule: (id: string, name: string) => void
  duplicateSchedule: (id: string) => void
  setActiveSchedule: (id: string | null) => void

  /** Adds the item and returns true, or returns false if it was a duplicate. */
  addItem: (
    scheduleId: string,
    item: ScheduleItem,
    opts?: AddItemOptions
  ) => boolean
  /** Inserts the item and returns true, or returns false if it was a duplicate. */
  insertItemAt: (
    scheduleId: string,
    item: ScheduleItem,
    index: number,
    opts?: AddItemOptions
  ) => boolean
  removeItem: (scheduleId: string, itemId: string) => void
  /**
   * Remove items from a schedule in bulk. With no predicate, clears every item;
   * with one, removes only the items it returns true for (e.g. song rows). Keeps
   * `activeItemIndex`/`selectedItemId` pointing at their items by id, nulling
   * them if those items were cleared.
   */
  clearItems: (
    scheduleId: string,
    shouldRemove?: (item: ScheduleItem) => boolean
  ) => void
  updateItem: (
    scheduleId: string,
    itemId: string,
    updates: Partial<ScheduleItem>
  ) => void
  reorderItem: (scheduleId: string, fromIndex: number, toIndex: number) => void

  setSelectedItem: (id: string | null) => void
  /** Flash-highlight a schedule item briefly (1.5 s). */
  flashItem: (id: string) => void
  /** Find an existing item in a schedule with the same content as `item`. */
  findDuplicate: (
    scheduleId: string,
    item: ScheduleItem
  ) => ScheduleItem | undefined
  goToItem: (index: number) => void
  nextItem: () => void
  prevItem: () => void
  presentItem: (item: ScheduleItem) => Promise<void>

  getActiveSchedule: () => ServiceSchedule | undefined
}

/**
 * Push the live schedule item's presenter notes to the stage monitor's Notes
 * zone. (This once also computed a "next item" preview for a dedicated stage
 * zone; that zone was removed, so only the notes feed remains.)
 */
function setStageNotesForItem(currentItem: ScheduleItem): void {
  useBroadcastStore.getState().setStageNotes(currentItem.notes ?? null)
}

let flashTimer: ReturnType<typeof setTimeout> | null = null

export const useScheduleStore = create<ScheduleState>((set, get) => ({
  schedules: [],
  activeScheduleId: null,
  activeItemIndex: null,
  activeSlideIndex: null,
  selectedItemId: null,
  highlightedId: null,
  activeSongDeck: null,

  createSchedule: (name) => {
    const schedule = createDefaultSchedule(name)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
    return schedule.id
  },

  deleteSchedule: (id) =>
    set((s) => ({
      schedules: s.schedules.filter((sc) => sc.id !== id),
      activeScheduleId: s.activeScheduleId === id ? null : s.activeScheduleId,
      activeItemIndex: s.activeScheduleId === id ? null : s.activeItemIndex,
    })),

  renameSchedule: (id, name) =>
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === id ? { ...sc, name, updatedAt: Date.now() } : sc
      ),
    })),

  duplicateSchedule: (id) => {
    const original = get().schedules.find((sc) => sc.id === id)
    if (!original) return
    const dup: ServiceSchedule = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (Copy)`,
      items: original.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ schedules: [...s.schedules, dup] }))
  },

  setActiveSchedule: (activeScheduleId) =>
    set({
      activeScheduleId,
      activeItemIndex: null,
      activeSlideIndex: null,
      selectedItemId: null,
    }),

  addItem: (scheduleId, item, opts) => {
    if (shouldDedupe(opts)) {
      const existing = get().findDuplicate(scheduleId, item)
      if (existing) {
        get().flashItem(existing.id)
        return false
      }
    }
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === scheduleId
          ? {
              ...sc,
              updatedAt: Date.now(),
              items: [...sc.items, { ...item, order: sc.items.length }],
            }
          : sc
      ),
    }))
    return true
  },

  insertItemAt: (scheduleId, item, index, opts) => {
    if (shouldDedupe(opts)) {
      const existing = get().findDuplicate(scheduleId, item)
      if (existing) {
        get().flashItem(existing.id)
        return false
      }
    }
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const items = [...sc.items]
        items.splice(index, 0, item)
        return {
          ...sc,
          updatedAt: Date.now(),
          items: items.map((i, idx) => ({ ...i, order: idx })),
        }
      }),
    }))
    return true
  },

  removeItem: (scheduleId, itemId) =>
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === scheduleId
          ? {
              ...sc,
              updatedAt: Date.now(),
              items: sc.items
                .filter((i) => i.id !== itemId)
                .map((i, idx) => ({ ...i, order: idx })),
            }
          : sc
      ),
      selectedItemId: s.selectedItemId === itemId ? null : s.selectedItemId,
    })),

  clearItems: (scheduleId, shouldRemove) =>
    set((s) => {
      const sc = s.schedules.find((x) => x.id === scheduleId)
      if (!sc) return {}
      const activeId =
        s.activeItemIndex !== null ? sc.items[s.activeItemIndex]?.id : null
      const kept = shouldRemove ? sc.items.filter((i) => !shouldRemove(i)) : []
      const items = kept.map((i, idx) => ({ ...i, order: idx }))
      const activeIdx =
        activeId != null ? items.findIndex((i) => i.id === activeId) : -1
      return {
        schedules: s.schedules.map((x) =>
          x.id === scheduleId ? { ...x, updatedAt: Date.now(), items } : x
        ),
        activeItemIndex: activeIdx >= 0 ? activeIdx : null,
        selectedItemId: items.some((i) => i.id === s.selectedItemId)
          ? s.selectedItemId
          : null,
      }
    }),

  updateItem: (scheduleId, itemId, updates) =>
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === scheduleId
          ? {
              ...sc,
              updatedAt: Date.now(),
              items: sc.items.map((i) =>
                i.id === itemId ? ({ ...i, ...updates } as ScheduleItem) : i
              ),
            }
          : sc
      ),
    })),

  reorderItem: (scheduleId, fromIndex, toIndex) =>
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const items = [...sc.items]
        const [moved] = items.splice(fromIndex, 1)
        items.splice(toIndex, 0, moved)
        return {
          ...sc,
          updatedAt: Date.now(),
          items: items.map((i, idx) => ({ ...i, order: idx })),
        }
      }),
    })),

  setSelectedItem: (selectedItemId) => set({ selectedItemId }),

  flashItem: (id) => {
    if (flashTimer) clearTimeout(flashTimer)
    set({ highlightedId: id })
    flashTimer = setTimeout(() => set({ highlightedId: null }), 1500)
  },

  findDuplicate: (scheduleId, item) => {
    const key = scheduleItemKey(item)
    if (!key) return undefined
    const schedule = get().schedules.find((sc) => sc.id === scheduleId)
    return schedule?.items.find(
      (i) => i.id !== item.id && scheduleItemKey(i) === key
    )
  },

  goToItem: (index) => {
    const schedule = get().getActiveSchedule()
    if (!schedule || index < 0 || index >= schedule.items.length) return
    const item = schedule.items[index]

    let activeSlideIndex: number | null = null
    let activeSongDeck: ScheduleState["activeSongDeck"] = null
    if (item.type === "slide") {
      activeSlideIndex = item.slideIndex
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
    void get().presentItem(item)
    setStageNotesForItem(item)
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
    if (next < schedule.items.length) get().goToItem(next)
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
      get().goToItem(prev)
    }
  },

  presentItem: async (item) => {
    switch (item.type) {
      case "scripture": {
        const si = item as ScriptureScheduleItem
        useBroadcastStore.setState({ broadcastSource: "schedule" })
        try {
          const verse = await invoke<Verse | null>("get_verse", {
            translationId: si.translationId,
            bookNumber: si.bookNumber,
            chapter: si.chapter,
            verse: si.verseStart,
          })
          if (verse) {
            useBibleStore.getState().selectVerse(verse)
            if (si.bookNumber > 0) {
              bibleActions.navigateToVerse(
                si.bookNumber,
                si.chapter,
                si.verseStart
              )
            }
            const abbr =
              useBibleStore
                .getState()
                .translations.find((t) => t.id === si.translationId)
                ?.abbreviation ??
              si.cachedReference.match(/\(([^)]+)\)/)?.[1] ??
              "KJV"
            const editKey = verseEditKey(
              si.translationId,
              si.bookNumber,
              si.chapter,
              si.verseStart
            )
            const savedEdit = useVerseEditStore.getState().getEdit(editKey)
            const renderData = toVerseRenderData(
              verse,
              abbr,
              undefined,
              savedEdit?.segments
            )
            useBroadcastStore.getState().setLiveVerse(renderData, "schedule")
          }
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

  getActiveSchedule: () => {
    const { schedules, activeScheduleId } = get()
    return schedules.find((sc) => sc.id === activeScheduleId)
  },
}))

// ── Persistence via tauri-plugin-store ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getScheduleStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("service-schedules.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateSchedules(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getScheduleStore()
      const schedules = (await store.get("schedules")) as
        ServiceSchedule[] | undefined
      const activeId = (await store.get("activeScheduleId")) as
        string | undefined

      if (schedules && Array.isArray(schedules) && schedules.length > 0) {
        useScheduleStore.setState({ schedules })
      }
      if (activeId) {
        useScheduleStore.setState({ activeScheduleId: activeId })
      }
      const activeIdx = (await store.get("activeItemIndex")) as
        number | undefined
      if (activeIdx != null) {
        useScheduleStore.setState({ activeItemIndex: activeIdx })
      }

      useScheduleStore.subscribe((state, prevState) => {
        if (
          state.schedules !== prevState.schedules ||
          state.activeScheduleId !== prevState.activeScheduleId ||
          state.activeItemIndex !== prevState.activeItemIndex
        ) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistSchedules(useScheduleStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[schedules] Failed to load persisted schedules, starting empty"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistSchedules(state: ScheduleState): Promise<void> {
  try {
    const store = await getScheduleStore()
    await store.set("schedules", state.schedules)
    await store.set("activeScheduleId", state.activeScheduleId)
    await store.set("activeItemIndex", state.activeItemIndex)
    await store.save()
  } catch {
    console.warn("[schedules] Failed to persist schedules")
  }
}
