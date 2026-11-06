import { describe, it, expect } from "vitest"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import type { ThemeElement } from "@/types/broadcast"
import { migrateStageConfig } from "./migrate"
import * as editing from "./editing"

const base = () => migrateStageConfig(DEFAULT_STAGE_DISPLAY_CONFIG, "L", 0)

describe("createStageDraft", () => {
  it("stamps updatedAt and fills missing arrays", () => {
    const layout = {
      ...base(),
      zones: undefined as never,
      elements: undefined as never,
      layerOrder: undefined as never,
    }
    const draft = editing.createStageDraft(layout, 42)
    expect(draft.zones).toEqual([])
    expect(draft.elements).toEqual([])
    expect(draft.layerOrder).toEqual([])
    expect(draft.updatedAt).toBe(42)
  })
})

describe("makeZone", () => {
  it("gives a clock zone a default format", () => {
    const z = editing.makeZone("clock", "z1")
    expect(z.source).toBe("clock")
    expect(z.clockFormat).toBe("12h")
    expect(z.text?.fontFamily).toBe("Inter")
  })

  it("labels a current zone CURRENT with a header", () => {
    const z = editing.makeZone("current", "z2")
    expect(z.label).toBe("CURRENT")
    expect(z.showHeader).toBe(true)
    expect(z.width).toBeGreaterThan(0)
  })
})

describe("addZone / removeZone", () => {
  it("prepends the new zone to layerOrder and selects it", () => {
    const { draft, selectedId } = editing.addZone(base(), "timer", "t1", 7)
    expect(selectedId).toBe("t1")
    expect(draft.layerOrder[0]).toBe("t1")
    expect(draft.zones.at(-1)?.id).toBe("t1")
    expect(draft.updatedAt).toBe(7)
  })

  it("removes a zone from both zones and layerOrder", () => {
    const start = base()
    const id = start.zones[0].id
    const draft = editing.removeZone(start, id, 9)
    expect(draft.zones.some((z) => z.id === id)).toBe(false)
    expect(draft.layerOrder).not.toContain(id)
  })
})

describe("reorderLayers", () => {
  it("moves a layer and no-ops on out-of-range indices", () => {
    const start = base()
    const order = start.layerOrder
    const moved = editing.reorderLayers(start, 0, 2, 3)
    expect(moved.layerOrder[2]).toBe(order[0])
    expect(editing.reorderLayers(start, -1, 0, 3)).toBe(start)
    expect(editing.reorderLayers(start, 0, 99, 3)).toBe(start)
  })
})

describe("toggle visibility / locked", () => {
  it("flips visible without bumping updatedAt", () => {
    const start = base()
    const id = start.zones[0].id
    const before = start.updatedAt
    const draft = editing.toggleZoneVisibility(start, id)
    expect(draft.zones.find((z) => z.id === id)?.visible).toBe(false)
    expect(draft.updatedAt).toBe(before)
  })

  it("flips locked", () => {
    const start = base()
    const id = start.zones[0].id
    const draft = editing.toggleZoneLocked(start, id)
    expect(draft.zones.find((z) => z.id === id)?.locked).toBe(true)
  })
})

describe("duplicateZone", () => {
  it("offsets the copy and inserts it before the source in layerOrder", () => {
    const start = base()
    const id = start.zones[0].id
    const result = editing.duplicateZone(start, id, "copy", 5)
    expect(result).not.toBeNull()
    const copy = result!.draft.zones.find((z) => z.id === "copy")!
    expect(copy.x).toBe(start.zones[0].x + 2)
    expect(copy.name).toContain("Copy")
    const idx = result!.draft.layerOrder.indexOf("copy")
    expect(result!.draft.layerOrder[idx + 1]).toBe(id)
  })

  it("returns null for an unknown id", () => {
    expect(editing.duplicateZone(base(), "nope", "x", 0)).toBeNull()
  })
})

describe("nudgeZone", () => {
  it("moves a zone by the delta", () => {
    const start = base()
    const z = start.zones[0]
    const draft = editing.nudgeZone(start, z.id, 5, -3, 8)!
    const moved = draft.zones.find((x) => x.id === z.id)!
    expect(moved.x).toBe(z.x + 5)
    expect(moved.y).toBe(z.y - 3)
  })

  it("no-ops on a locked zone", () => {
    const start = editing.toggleZoneLocked(base(), base().zones[0].id)
    expect(editing.nudgeZone(start, start.zones[0].id, 5, 5, 0)).toBeNull()
  })

  it("moves a free-form element too", () => {
    const el: ThemeElement = {
      id: "e1",
      type: "shape",
      name: "Box",
      x: 10,
      y: 10,
      width: 100,
      height: 100,
      visible: true,
      locked: false,
    }
    const start = { ...base(), elements: [el], layerOrder: ["e1"] }
    const draft = editing.nudgeZone(start, "e1", 4, 4, 1)!
    expect(draft.elements[0].x).toBe(14)
  })

  it("returns null when nothing is selected", () => {
    expect(editing.nudgeZone(base(), "missing", 1, 1, 0)).toBeNull()
  })
})

describe("promoteBuiltinToCustom", () => {
  it("clears builtin and renames", () => {
    const draft = editing.promoteBuiltinToCustom(base(), "new-id", 100)
    expect(draft.id).toBe("new-id")
    expect(draft.builtin).toBe(false)
    expect(draft.name).toContain("(Custom)")
    expect(draft.createdAt).toBe(100)
  })
})

describe("findLayer", () => {
  it("finds zones and elements by id", () => {
    const start = base()
    expect(editing.findLayer(start, start.zones[0].id)?.id).toBe(
      start.zones[0].id
    )
    expect(editing.findLayer(start, "nope")).toBeUndefined()
  })
})

describe("sanitizeStageLayout", () => {
  // A layout saved before "next" was retired: a stale zone plus its layerOrder id.
  const withStaleNext = () => {
    const start = base()
    const stale = {
      ...editing.makeZone("current", "stale-next"),
      source: "next" as never,
    }
    return {
      ...start,
      zones: [...start.zones, stale],
      layerOrder: [...start.layerOrder, "stale-next"],
    }
  }

  it("drops zones with an unsupported source and their layerOrder ids", () => {
    const cleaned = editing.sanitizeStageLayout(withStaleNext())
    expect(cleaned.zones.some((z) => z.id === "stale-next")).toBe(false)
    expect(cleaned.layerOrder).not.toContain("stale-next")
    // Every surviving layerOrder id still resolves to a real zone.
    for (const id of cleaned.layerOrder) {
      expect(cleaned.zones.some((z) => z.id === id)).toBe(true)
    }
  })

  it("returns the same reference when nothing needs removing", () => {
    const start = base()
    expect(editing.sanitizeStageLayout(start)).toBe(start)
  })

  it("keeps free-form element ids in layerOrder", () => {
    const el: ThemeElement = {
      id: "e1",
      type: "shape",
      name: "Box",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      visible: true,
      locked: false,
    }
    const layout = {
      ...withStaleNext(),
      elements: [el],
    }
    layout.layerOrder = [...layout.layerOrder, "e1"]
    const cleaned = editing.sanitizeStageLayout(layout)
    expect(cleaned.layerOrder).toContain("e1")
    expect(cleaned.layerOrder).not.toContain("stale-next")
  })
})
