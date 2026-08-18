import { beforeEach, describe, expect, it, vi } from "vitest"
import { scheduleItemKey, type ScheduleItem } from "@/types/schedule"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn(() => Promise.resolve()),
  emit: vi.fn(() => Promise.resolve()),
}))

// Static imports (not dynamic `await import()`): the stores are singletons and
// this file never calls `vi.resetModules()`, so there is no reason to re-import
// per hook/test. Static imports let Vitest transform this heavy store graph
// (schedule-store transitively pulls in ~every store) once at collection time
// instead of racing an on-demand transform inside each 5s-bounded async hook —
// the latter returned a not-yet-populated module namespace under CPU
// starvation, surfacing as `useScheduleStore` being `undefined`. The `vi.mock`
// calls above are hoisted above these imports, so the tauri mocks still apply.
import { useScheduleStore } from "./schedule-store"
import { useSettingsStore } from "./settings-store"
import { useSongStore } from "./song-store"
import { useBroadcastStore } from "./broadcast-store"
import { createDefaultSong } from "@/types/song"

function scripture(
  overrides: Partial<Extract<ScheduleItem, { type: "scripture" }>> = {}
) {
  return {
    id: crypto.randomUUID(),
    type: "scripture" as const,
    label: "John 3:16 (KJV)",
    order: 0,
    translationId: 1,
    bookNumber: 43,
    chapter: 3,
    verseStart: 16,
    verseEnd: 16,
    cachedReference: "John 3:16 (KJV)",
    cachedText: "",
    ...overrides,
  }
}

describe("scheduleItemKey", () => {
  it("matches scripture items covering the same reference and range", () => {
    expect(scheduleItemKey(scripture())).toBe(scheduleItemKey(scripture()))
    expect(scheduleItemKey(scripture())).not.toBe(
      scheduleItemKey(scripture({ verseEnd: 18 }))
    )
    expect(scheduleItemKey(scripture())).not.toBe(
      scheduleItemKey(scripture({ translationId: 2 }))
    )
  })

  it("keys a grouped slide item by its deck, an ungrouped one by its slide", () => {
    const deck = {
      id: "a",
      type: "slide" as const,
      label: "s",
      order: 0,
      presentationId: "p1",
      slideIndex: 0,
    }
    expect(scheduleItemKey(deck)).toBe(
      scheduleItemKey({ ...deck, id: "b", slideIndex: 4 })
    )
    expect(scheduleItemKey({ ...deck, groupSlides: false })).not.toBe(
      scheduleItemKey({ ...deck, id: "b", slideIndex: 4, groupSlides: false })
    )
  })

  it("keys YouTube items by video id and other web items by normalized url", () => {
    const yt = {
      id: "a",
      type: "web" as const,
      label: "v",
      order: 0,
      url: "https://youtu.be/xyz?t=30",
      autoplay: true,
      isYouTube: true,
      videoId: "xyz",
    }
    expect(scheduleItemKey(yt)).toBe(
      scheduleItemKey({
        ...yt,
        id: "b",
        url: "https://www.youtube.com/watch?v=xyz",
      })
    )
    const web = {
      id: "a",
      type: "web" as const,
      label: "w",
      order: 0,
      url: "https://Example.com/page/",
      autoplay: true,
      isYouTube: false,
    }
    expect(scheduleItemKey(web)).toBe(
      scheduleItemKey({ ...web, id: "b", url: "https://example.com/page" })
    )
  })

  it("never keys headers or unconfigured placeholders", () => {
    expect(
      scheduleItemKey({ id: "a", type: "header", label: "Worship", order: 0 })
    ).toBeNull()
    expect(
      scheduleItemKey({
        id: "a",
        type: "media",
        label: "Media",
        order: 0,
        mediaAssetId: "",
      })
    ).toBeNull()
    expect(
      scheduleItemKey({
        id: "a",
        type: "slide",
        label: "New Slide",
        order: 0,
        presentationId: "",
        slideIndex: 0,
      })
    ).toBeNull()
    expect(
      scheduleItemKey({
        id: "a",
        type: "web",
        label: "Web Page",
        order: 0,
        url: "",
        autoplay: true,
        isYouTube: false,
      })
    ).toBeNull()
  })
})

describe("schedule store duplicate prevention", () => {
  let scheduleId: string

  beforeEach(() => {
    useSettingsStore.setState({ preventDuplicateScheduleItems: true })
    useScheduleStore.setState({ schedules: [], highlightedId: null })
    scheduleId = useScheduleStore.getState().createSchedule("Sunday")
  })

  it("rejects a duplicate and flash-highlights the existing item", () => {
    const store = useScheduleStore.getState()

    const first = scripture()
    expect(store.addItem(scheduleId, first)).toBe(true)
    expect(store.addItem(scheduleId, scripture())).toBe(false)

    const schedule =
      useScheduleStore.getState().getActiveSchedule() ??
      useScheduleStore.getState().schedules[0]
    expect(schedule.items).toHaveLength(1)
    expect(useScheduleStore.getState().highlightedId).toBe(first.id)
  })

  it("allows duplicates when the setting is turned off", () => {
    useSettingsStore.setState({ preventDuplicateScheduleItems: false })
    const store = useScheduleStore.getState()

    expect(store.addItem(scheduleId, scripture())).toBe(true)
    expect(store.addItem(scheduleId, scripture())).toBe(true)
    expect(store.insertItemAt(scheduleId, scripture(), 0)).toBe(true)
    expect(useScheduleStore.getState().schedules[0].items).toHaveLength(3)
    expect(useScheduleStore.getState().highlightedId).toBeNull()
  })

  it("allows duplicates when dedupe is disabled", () => {
    const store = useScheduleStore.getState()

    expect(store.addItem(scheduleId, scripture(), { dedupe: false })).toBe(true)
    expect(store.addItem(scheduleId, scripture(), { dedupe: false })).toBe(true)
    expect(useScheduleStore.getState().schedules[0].items).toHaveLength(2)
  })

  it("allows repeated section headers", () => {
    const store = useScheduleStore.getState()
    const header = { type: "header" as const, label: "Section", order: 0 }

    expect(
      store.addItem(scheduleId, { ...header, id: crypto.randomUUID() })
    ).toBe(true)
    expect(
      store.addItem(scheduleId, { ...header, id: crypto.randomUUID() })
    ).toBe(true)
    expect(useScheduleStore.getState().schedules[0].items).toHaveLength(2)
  })

  it("applies the same check to insertItemAt", () => {
    const store = useScheduleStore.getState()

    expect(store.insertItemAt(scheduleId, scripture(), 0)).toBe(true)
    expect(store.insertItemAt(scheduleId, scripture(), 0)).toBe(false)
    expect(useScheduleStore.getState().schedules[0].items).toHaveLength(1)
  })

  it("does not treat an item as its own duplicate", () => {
    const store = useScheduleStore.getState()
    const item = scripture()
    store.addItem(scheduleId, item)
    expect(store.findDuplicate(scheduleId, item)).toBeUndefined()
  })
})

function song(
  overrides: Partial<Extract<ScheduleItem, { type: "song" }>> = {}
) {
  return {
    id: crypto.randomUUID(),
    type: "song" as const,
    label: "Amazing Grace",
    order: 0,
    songId: crypto.randomUUID(),
    cachedTitle: "Amazing Grace",
    ...overrides,
  }
}

describe("schedule store clearItems", () => {
  let scheduleId: string

  beforeEach(() => {
    useSettingsStore.setState({ preventDuplicateScheduleItems: false })
    useScheduleStore.setState({
      schedules: [],
      highlightedId: null,
      activeItemIndex: null,
      selectedItemId: null,
    })
    scheduleId = useScheduleStore.getState().createSchedule("Sunday")
  })

  it("clears every item when given no predicate", () => {
    const store = useScheduleStore.getState()
    store.addItem(scheduleId, scripture())
    store.addItem(scheduleId, song())

    store.clearItems(scheduleId)

    expect(useScheduleStore.getState().schedules[0].items).toHaveLength(0)
  })

  it("removes only matching items and re-indexes the rest", () => {
    const store = useScheduleStore.getState()
    store.addItem(scheduleId, song())
    store.addItem(scheduleId, scripture())
    store.addItem(scheduleId, song())

    store.clearItems(scheduleId, (i) => i.type === "song")

    const items = useScheduleStore.getState().schedules[0].items
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe("scripture")
    expect(items[0].order).toBe(0)
  })

  it("keeps the active index on its item and nulls it when cleared", () => {
    const store = useScheduleStore.getState()
    const keep = scripture()
    store.addItem(scheduleId, song())
    store.addItem(scheduleId, keep)
    // Active item is the scripture at index 1.
    useScheduleStore.setState({ activeItemIndex: 1, selectedItemId: keep.id })

    store.clearItems(scheduleId, (i) => i.type === "song")

    // Scripture shifted to index 0; active index and selection follow it.
    expect(useScheduleStore.getState().activeItemIndex).toBe(0)
    expect(useScheduleStore.getState().selectedItemId).toBe(keep.id)

    store.clearItems(scheduleId)
    expect(useScheduleStore.getState().activeItemIndex).toBeNull()
    expect(useScheduleStore.getState().selectedItemId).toBeNull()
  })
})

describe("schedule store song slide navigation", () => {
  let scheduleId: string
  let songId: string

  // A song whose default arrangement produces a 3-slide deck (a 6-line verse
  // wrapped into 2, plus a 1-slide chorus).
  function seedSong() {
    const base = createDefaultSong("Amazing Grace")
    const verse = {
      id: "v1",
      type: "verse" as const,
      label: "Verse 1",
      lyrics: "l1\nl2\nl3\nl4\nl5\nl6",
    }
    const chorus = {
      id: "c1",
      type: "chorus" as const,
      label: "Chorus",
      lyrics: "c1\nc2",
    }
    const song = {
      ...base,
      sections: [verse, chorus],
      arrangements: [
        {
          id: "arr1",
          name: "Default",
          sectionIds: [verse.id, chorus.id],
          isDefault: true,
        },
      ],
      slideOptions: {
        maxLinesPerSlide: 4,
        breakOnBlankLines: true,
        includeTitleSlide: false,
        includeBlankEndSlide: false,
      },
    }
    useSongStore.setState({ songs: [song] })
    return song.id
  }

  beforeEach(() => {
    useSettingsStore.setState({ preventDuplicateScheduleItems: false })
    useScheduleStore.setState({
      schedules: [],
      highlightedId: null,
      activeItemIndex: null,
      activeSlideIndex: null,
      selectedItemId: null,
      activeSongDeck: null,
    })
    songId = seedSong()
    scheduleId = useScheduleStore.getState().createSchedule("Sunday")
    useScheduleStore.getState().setActiveSchedule(scheduleId)
  })

  it("steps forward/back through a live song's slides", () => {
    const store = useScheduleStore.getState()
    store.addItem(scheduleId, song({ songId }))
    store.goToItem(0)

    // Go-live cached a multi-slide deck and started at slide 0.
    const deck = useScheduleStore.getState().activeSongDeck
    expect(deck?.deck.slides.length).toBe(3)
    expect(useScheduleStore.getState().activeSlideIndex).toBe(0)

    store.nextItem()
    expect(useScheduleStore.getState().activeSlideIndex).toBe(1)
    store.nextItem()
    expect(useScheduleStore.getState().activeSlideIndex).toBe(2)
    // Still on the song, not advanced to another item.
    expect(useScheduleStore.getState().activeItemIndex).toBe(0)

    store.prevItem()
    expect(useScheduleStore.getState().activeSlideIndex).toBe(1)
  })

  it("goToItem stages into the preview without touching the audience", async () => {
    const store = useScheduleStore.getState()
    store.addItem(scheduleId, song({ songId }))
    useBroadcastStore.setState({
      isLive: true,
      liveSlide: null,
      previewSlide: null,
      previewPending: false,
    })

    await store.goToItem(0)

    // Selecting an item stages it (Program preview) but leaves the audience blank.
    expect(useScheduleStore.getState().activeItemIndex).toBe(0)
    expect(useBroadcastStore.getState().previewSlide).not.toBeNull()
    expect(useBroadcastStore.getState().liveSlide).toBeNull()
    expect(useBroadcastStore.getState().previewPending).toBe(true)
  })

  it("presentLive stages the item and then takes it to the audience", async () => {
    const store = useScheduleStore.getState()
    store.addItem(scheduleId, song({ songId }))
    useBroadcastStore.setState({
      isLive: true,
      liveSlide: null,
      previewSlide: null,
      previewPending: false,
    })

    await store.presentLive(0)

    // The play icon path: goToItem staged it, then takeToLive committed to live.
    expect(useScheduleStore.getState().activeItemIndex).toBe(0)
    expect(useBroadcastStore.getState().liveSlide).not.toBeNull()
    expect(useBroadcastStore.getState().previewPending).toBe(false)
  })

  it("steps a song's slides even when the deck cache is empty", () => {
    const store = useScheduleStore.getState()
    store.addItem(scheduleId, song({ songId }))
    store.goToItem(0)

    // Simulate the deck cache being absent (e.g. active item restored without
    // its transient deck): nextItem must still regenerate and step the slide,
    // not skip to the next schedule item.
    useScheduleStore.setState({ activeSongDeck: null })
    store.nextItem()
    expect(useScheduleStore.getState().activeSlideIndex).toBe(1)
    expect(useScheduleStore.getState().activeItemIndex).toBe(0)
  })
})

describe("schedule store importSchedule", () => {
  beforeEach(() => {
    useScheduleStore.setState({ schedules: [], activeScheduleId: null })
  })

  it("appends an already-parsed schedule verbatim and returns its id", () => {
    const store = useScheduleStore.getState()
    const imported = {
      id: crypto.randomUUID(),
      name: "Imported Service",
      items: [scripture(), scripture({ verseStart: 17, verseEnd: 17 })],
      createdAt: 111,
      updatedAt: 222,
    }

    const id = store.importSchedule(imported)

    expect(id).toBe(imported.id)
    const schedules = useScheduleStore.getState().schedules
    expect(schedules).toHaveLength(1)
    // Stored verbatim — ids, items, and timestamps are the caller's
    // responsibility (the parser assigns fresh ids), so importSchedule must not
    // mutate them or re-index.
    expect(schedules[0]).toBe(imported)
  })

  it("adds alongside existing schedules without activating the import", () => {
    const store = useScheduleStore.getState()
    const firstId = store.createSchedule("Existing")
    store.setActiveSchedule(firstId)

    const importedId = store.importSchedule({
      id: crypto.randomUUID(),
      name: "Imported",
      items: [],
      createdAt: 0,
      updatedAt: 0,
    })

    const state = useScheduleStore.getState()
    expect(state.schedules.map((s) => s.id)).toEqual([firstId, importedId])
    // Importing never steals the active selection.
    expect(state.activeScheduleId).toBe(firstId)
  })
})
