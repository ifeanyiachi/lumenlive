import { describe, expect, it } from "vitest"
import {
  DEFAULT_LAYER_ORDER,
  addElement,
  createDraft,
  duplicateElement,
  makeElement,
  nudgeSelection,
  promoteBuiltinToCustom,
  removeElement,
  reorderLayers,
  setNestedValue,
  toggleElementLocked,
  toggleElementVisibility,
} from "./theme-editing"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastTheme } from "@/types/broadcast"

/** A fresh, mutable draft based on a real built-in theme. */
function baseDraft(): BroadcastTheme {
  return createDraft(structuredClone(BUILTIN_THEMES[0]), 1000)
}

const NOW = 5000

describe("setNestedValue", () => {
  it("sets a shallow key immutably", () => {
    const obj = { a: 1, b: 2 }
    const next = setNestedValue(obj, "a", 9)
    expect(next).toEqual({ a: 9, b: 2 })
    expect(obj.a).toBe(1)
  })

  it("sets a deep key, cloning only along the path", () => {
    const obj = { layout: { offsetX: 0, offsetY: 5 }, other: { k: 1 } }
    const next = setNestedValue(obj, "layout.offsetX", 42) as typeof obj
    expect(next.layout.offsetX).toBe(42)
    expect(next.layout.offsetY).toBe(5)
    expect(next.other).toBe(obj.other) // untouched branch shared by reference
    expect(obj.layout.offsetX).toBe(0)
  })

  it("addresses array indices with numeric segments", () => {
    const obj = { stops: [{ position: 0 }, { position: 1 }] }
    const next = setNestedValue(obj, "stops.1.position", 0.5) as typeof obj
    expect(next.stops[1].position).toBe(0.5)
    expect(next.stops[0]).toBe(obj.stops[0])
  })

  it("creates missing containers based on the next segment type", () => {
    const next = setNestedValue({}, "a.0.b", "x") as { a: { b: string }[] }
    expect(Array.isArray(next.a)).toBe(true)
    expect(next.a[0].b).toBe("x")
  })
})

describe("createDraft", () => {
  it("guarantees elements/layerOrder and stamps updatedAt", () => {
    const raw = {
      ...structuredClone(BUILTIN_THEMES[0]),
      elements: undefined,
      layerOrder: undefined,
    } as unknown as BroadcastTheme
    const draft = createDraft(raw, NOW)
    expect(draft.elements).toEqual([])
    expect(draft.layerOrder).toEqual(DEFAULT_LAYER_ORDER)
    expect(draft.updatedAt).toBe(NOW)
  })

  it("preserves existing elements and layer order", () => {
    const draft = baseDraft()
    const withEl = addElement(draft, "shape", "el-1", NOW).draft
    const re = createDraft(withEl, NOW + 1)
    expect(re.elements).toEqual(withEl.elements)
    expect(re.layerOrder).toEqual(withEl.layerOrder)
  })
})

describe("makeElement", () => {
  it("builds an image element with default geometry and image style", () => {
    const el = makeElement("image", "id-1")
    expect(el).toMatchObject({
      id: "id-1",
      type: "image",
      name: "Image",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      visible: true,
      locked: false,
    })
    expect(el.image).toEqual({
      url: "",
      fit: "cover",
      opacity: 1,
      borderRadius: 0,
    })
    expect(el.shape).toBeUndefined()
  })

  it("builds a shape element with default shape style", () => {
    const el = makeElement("shape", "id-2")
    expect(el.name).toBe("Shape")
    expect(el.shape?.shapeType).toBe("rectangle")
    expect(el.image).toBeUndefined()
  })
})

describe("addElement", () => {
  it("appends the element and puts it on top of the layer order", () => {
    const draft = baseDraft()
    const { draft: next, selectedId } = addElement(
      draft,
      "image",
      "new-el",
      NOW
    )
    expect(next.elements.at(-1)?.id).toBe("new-el")
    expect(next.layerOrder[0]).toBe("new-el")
    expect(selectedId).toBe("new-el")
    expect(next.updatedAt).toBe(NOW)
    expect(draft.elements).toHaveLength(0) // input untouched
  })
})

describe("removeElement", () => {
  it("drops the element from both elements and layerOrder", () => {
    const withEl = addElement(baseDraft(), "shape", "gone", NOW).draft
    const next = removeElement(withEl, "gone", NOW + 1)
    expect(next.elements.find((e) => e.id === "gone")).toBeUndefined()
    expect(next.layerOrder).not.toContain("gone")
    expect(next.updatedAt).toBe(NOW + 1)
  })
})

describe("reorderLayers", () => {
  it("moves a layer from one index to another", () => {
    const draft = baseDraft() // layerOrder = [textArea, verse, reference]
    const next = reorderLayers(draft, 0, 2, NOW)
    expect(next.layerOrder).toEqual(["verse", "reference", "textArea"])
    expect(next.updatedAt).toBe(NOW)
  })
})

describe("toggle element flags", () => {
  it("toggleElementVisibility flips visible without bumping updatedAt", () => {
    const withEl = addElement(baseDraft(), "shape", "e", NOW).draft
    const next = toggleElementVisibility(withEl, "e")
    expect(next.elements.find((x) => x.id === "e")?.visible).toBe(false)
    expect(next.updatedAt).toBe(withEl.updatedAt)
  })

  it("toggleElementLocked flips locked without bumping updatedAt", () => {
    const withEl = addElement(baseDraft(), "shape", "e", NOW).draft
    const next = toggleElementLocked(withEl, "e")
    expect(next.elements.find((x) => x.id === "e")?.locked).toBe(true)
    expect(next.updatedAt).toBe(withEl.updatedAt)
  })
})

describe("duplicateElement", () => {
  it("copies the element, offsets it, and inserts before the source in order", () => {
    const withEl = addElement(baseDraft(), "shape", "src", NOW).draft
    const result = duplicateElement(withEl, "src", "copy", NOW + 1)
    expect(result).not.toBeNull()
    const copy = result!.draft.elements.find((e) => e.id === "copy")!
    const src = withEl.elements.find((e) => e.id === "src")!
    expect(copy.name).toBe(`${src.name} Copy`)
    expect(copy.x).toBe(src.x + 2)
    expect(copy.y).toBe(src.y + 2)
    expect(result!.selectedId).toBe("copy")
    const order = result!.draft.layerOrder
    expect(order.indexOf("copy")).toBe(order.indexOf("src") - 1) // copy inserted just before source
  })

  it("returns null for an unknown element", () => {
    expect(duplicateElement(baseDraft(), "nope", "copy", NOW)).toBeNull()
  })
})

describe("nudgeSelection", () => {
  it("moves the layout offset for the verse/reference regions", () => {
    const draft = baseDraft()
    const next = nudgeSelection(draft, "verse", 3, -4, NOW)!
    expect(next.layout.offsetX).toBe(draft.layout.offsetX + 3)
    expect(next.layout.offsetY).toBe(draft.layout.offsetY - 4)
    expect(next.updatedAt).toBe(NOW)
  })

  it("moves a custom element by (dx, dy)", () => {
    const withEl = addElement(baseDraft(), "shape", "e", NOW).draft
    const next = nudgeSelection(withEl, "e", 10, 20, NOW + 1)!
    const el = next.elements.find((x) => x.id === "e")!
    expect(el.x).toBe(100 + 10)
    expect(el.y).toBe(100 + 20)
  })

  it("returns null for a locked element (no-op)", () => {
    let withEl = addElement(baseDraft(), "shape", "e", NOW).draft
    withEl = toggleElementLocked(withEl, "e")
    expect(nudgeSelection(withEl, "e", 5, 5, NOW)).toBeNull()
  })

  it("returns null for a missing element", () => {
    expect(nudgeSelection(baseDraft(), "ghost", 1, 1, NOW)).toBeNull()
  })
})

describe("promoteBuiltinToCustom", () => {
  it("clears the builtin flag and stamps identity/timestamps", () => {
    const draft = baseDraft()
    const custom = promoteBuiltinToCustom(draft, "custom-id", NOW)
    expect(custom.id).toBe("custom-id")
    expect(custom.builtin).toBe(false)
    expect(custom.name).toBe(`${draft.name} (Custom)`)
    expect(custom.createdAt).toBe(NOW)
    expect(custom.updatedAt).toBe(NOW)
  })
})
