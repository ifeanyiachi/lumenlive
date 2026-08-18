import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Verse } from "@/types/bible"

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }))
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }))
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: vi.fn(() => Promise.resolve()),
  emit: vi.fn(() => Promise.resolve()),
}))
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

import {
  addVersesToSchedule,
  addVersesToQueue,
  handleScheduleDrop,
} from "./schedule-drop"
import { useScheduleStore } from "@/stores/schedule-store"
import { useQueueStore } from "@/stores"

function verse(n: number): Verse {
  return {
    id: n,
    translation_id: 1,
    book_number: 43,
    book_name: "John",
    book_abbreviation: "Jn",
    chapter: 3,
    verse: n,
    text: `verse ${n} text`,
  }
}

function versesPayload(...ns: number[]) {
  return {
    kind: "verses" as const,
    verses: ns.map(verse),
    translation: "KJV",
    translationId: 1,
  }
}

function seedSchedule(count: number): string {
  const store = useScheduleStore.getState()
  const scheduleId = store.createSchedule()
  store.setActiveSchedule(scheduleId)
  for (let i = 0; i < count; i++) {
    store.addItem(
      scheduleId,
      { id: crypto.randomUUID(), type: "header", label: `Item ${i}`, order: i },
      { dedupe: false }
    )
  }
  return scheduleId
}

function labelsOf(scheduleId: string): string[] {
  return (
    useScheduleStore
      .getState()
      .schedules.find((s) => s.id === scheduleId)
      ?.items.map((i) => i.label) ?? []
  )
}

describe("addVersesToSchedule", () => {
  beforeEach(() => {
    useScheduleStore.setState({
      schedules: [],
      activeScheduleId: null,
      activeItemIndex: null,
    })
  })

  it("no-ops when no schedule is active", () => {
    addVersesToSchedule(versesPayload(1))
    expect(useScheduleStore.getState().schedules).toEqual([])
  })

  it("inserts at the explicit index when one is given (drop indicator target)", () => {
    const scheduleId = seedSchedule(3) // Item 0, Item 1, Item 2
    useScheduleStore.setState({ activeItemIndex: 2 })

    addVersesToSchedule(versesPayload(1), 1)

    expect(labelsOf(scheduleId)).toEqual([
      "Item 0",
      "John 3:1 (KJV)",
      "Item 1",
      "Item 2",
    ])
  })

  it("keeps multiple dropped verses in order from the drop point", () => {
    const scheduleId = seedSchedule(1) // Item 0

    addVersesToSchedule(versesPayload(1, 2), 0)

    expect(labelsOf(scheduleId)).toEqual([
      "John 3:1 (KJV)",
      "John 3:2 (KJV)",
      "Item 0",
    ])
  })

  it("falls back to just after the active item when no index is given", () => {
    const scheduleId = seedSchedule(3)
    useScheduleStore.setState({ activeItemIndex: 0 })

    addVersesToSchedule(versesPayload(9))

    expect(labelsOf(scheduleId)).toEqual([
      "Item 0",
      "John 3:9 (KJV)",
      "Item 1",
      "Item 2",
    ])
  })
})

describe("handleScheduleDrop", () => {
  beforeEach(() => {
    useScheduleStore.setState({
      schedules: [],
      activeScheduleId: null,
      activeItemIndex: null,
    })
  })

  it("routes a verses payload into the active schedule", () => {
    const scheduleId = seedSchedule(0)

    handleScheduleDrop(versesPayload(1), 0)

    expect(labelsOf(scheduleId)).toEqual(["John 3:1 (KJV)"])
  })
})

describe("addVersesToQueue", () => {
  beforeEach(() => {
    useQueueStore.getState().clearQueue()
  })

  it("adds each verse to the queue as a manual item", () => {
    addVersesToQueue(versesPayload(1, 2))

    const items = useQueueStore.getState().items
    expect(items.map((i) => i.reference).sort()).toEqual([
      "John 3:1 (KJV)",
      "John 3:2 (KJV)",
    ])
    expect(items.every((i) => i.source === "manual")).toBe(true)
  })
})
