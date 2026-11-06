import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MediaAsset } from "@/types/media"

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

import { addAssetsToSchedule } from "./schedule-media"
import { useScheduleStore } from "@/stores/schedule-store"

function asset(id: string): MediaAsset {
  return {
    id,
    name: `asset-${id}`,
    type: "image",
    filePath: `C:/media/${id}.png`,
    fileSize: 1,
    tags: [],
    addedAt: 0,
  }
}

function seedSchedule(count: number): string {
  const store = useScheduleStore.getState()
  const scheduleId = store.createSchedule()
  store.setActiveSchedule(scheduleId)
  for (let i = 0; i < count; i++) {
    store.addItem(
      scheduleId,
      {
        id: crypto.randomUUID(),
        type: "header",
        label: `Item ${i}`,
        order: i,
      },
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

describe("addAssetsToSchedule insert position", () => {
  beforeEach(() => {
    useScheduleStore.setState({
      schedules: [],
      activeScheduleId: null,
      activeItemIndex: null,
    })
  })

  it("inserts at the explicit index when one is given (drop indicator target)", () => {
    const scheduleId = seedSchedule(3) // Item 0, Item 1, Item 2
    // Active item is the last one, so the legacy behaviour would append.
    useScheduleStore.setState({ activeItemIndex: 2 })

    addAssetsToSchedule([asset("x")], true, 1)

    expect(labelsOf(scheduleId)).toEqual([
      "Item 0",
      "asset-x",
      "Item 1",
      "Item 2",
    ])
  })

  it("keeps multiple dropped assets in order from the drop point", () => {
    const scheduleId = seedSchedule(2) // Item 0, Item 1

    addAssetsToSchedule([asset("a"), asset("b")], true, 0)

    expect(labelsOf(scheduleId)).toEqual([
      "asset-a",
      "asset-b",
      "Item 0",
      "Item 1",
    ])
  })

  it("falls back to just after the active item when no index is given", () => {
    const scheduleId = seedSchedule(3)
    useScheduleStore.setState({ activeItemIndex: 0 })

    addAssetsToSchedule([asset("y")], true)

    expect(labelsOf(scheduleId)).toEqual([
      "Item 0",
      "asset-y",
      "Item 1",
      "Item 2",
    ])
  })
})
