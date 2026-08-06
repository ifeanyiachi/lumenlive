import { describe, expect, it } from "vitest"
import {
  appendElementToSlide,
  appendSlide,
  duplicateSlideAt,
  moveElementDown,
  moveElementToBottom,
  moveElementToTop,
  moveElementUp,
  removeElements,
  removeSlideAt,
  reorderElements,
  reorderSlideAt,
  updateElementOnSlide,
  updateElements,
  updateElementsById,
  updateSlideAt,
} from "./slide-mutations"
import {
  createDefaultPresentation,
  createDefaultSlide,
  createDefaultTextElement,
} from "@/types/slide"
import type { Presentation, SlideElement } from "@/types/slide"

/** Build a presentation whose first slide has elements with the given ids. */
function presentationWithElements(ids: string[]): Presentation {
  const p = createDefaultPresentation("Test")
  const slide = createDefaultSlide()
  slide.elements = ids.map((id) => ({ ...createDefaultTextElement(), id }))
  p.slides = [slide]
  return p
}

function ids(elements: SlideElement[]): string[] {
  return elements.map((e) => e.id)
}

const NOW = 9000

describe("element-array transforms", () => {
  it("reorderElements moves an element", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    expect(ids(reorderElements(els, 0, 2))).toEqual(["b", "c", "a"])
  })

  it("moveElementToTop pushes to the end, or no-ops when already last/missing", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    expect(ids(moveElementToTop(els, "a")!)).toEqual(["b", "c", "a"])
    expect(moveElementToTop(els, "c")).toBeNull() // already last
    expect(moveElementToTop(els, "x")).toBeNull() // missing
  })

  it("moveElementToBottom unshifts to the front, or no-ops when already first/missing", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    expect(ids(moveElementToBottom(els, "c")!)).toEqual(["c", "a", "b"])
    expect(moveElementToBottom(els, "a")).toBeNull()
    expect(moveElementToBottom(els, "x")).toBeNull()
  })

  it("moveElementUp swaps toward the end", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    expect(ids(moveElementUp(els, "a")!)).toEqual(["b", "a", "c"])
    expect(moveElementUp(els, "c")).toBeNull() // already last
  })

  it("moveElementDown swaps toward the front", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    expect(ids(moveElementDown(els, "c")!)).toEqual(["a", "c", "b"])
    expect(moveElementDown(els, "a")).toBeNull() // already first
  })

  it("removeElements filters by id set", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    expect(ids(removeElements(els, ["a", "c"]))).toEqual(["b"])
  })

  it("updateElements patches only matching ids", () => {
    const els = presentationWithElements(["a", "b"]).slides[0].elements
    const next = updateElements(els, ["b"], { x: 42 } as Partial<SlideElement>)
    expect(next[0].x).toBe(els[0].x)
    expect(next[1].x).toBe(42)
  })

  it("updateElementsById applies a different patch to each element in one pass", () => {
    const els = presentationWithElements(["a", "b", "c"]).slides[0].elements
    const next = updateElementsById(
      els,
      new Map<string, Partial<SlideElement>>([
        ["a", { x: 1 } as Partial<SlideElement>],
        ["c", { y: 9 } as Partial<SlideElement>],
      ])
    )
    expect(next[0].x).toBe(1)
    expect(next[1]).toBe(els[1]) // untouched element keeps its identity
    expect(next[2].y).toBe(9)
  })

  it("updateElementsById is a no-op (same array reference) for an empty map", () => {
    const els = presentationWithElements(["a", "b"]).slides[0].elements
    expect(updateElementsById(els, new Map())).toBe(els)
  })
})

describe("presentation/slide transforms", () => {
  it("updateSlideAt bumps deck updatedAt but not the slide's", () => {
    const p = presentationWithElements(["a"])
    const slideStamp = p.slides[0].updatedAt
    const next = updateSlideAt(p, 0, { name: "Renamed" }, NOW)
    expect(next.updatedAt).toBe(NOW)
    expect(next.slides[0].name).toBe("Renamed")
    expect(next.slides[0].updatedAt).toBe(slideStamp) // slide stamp untouched
  })

  it("updateElementOnSlide bumps both the slide and deck updatedAt", () => {
    const p = presentationWithElements(["a", "b"])
    const next = updateElementOnSlide(
      p,
      0,
      "a",
      { x: 5 } as Partial<SlideElement>,
      NOW
    )
    expect(next.updatedAt).toBe(NOW)
    expect(next.slides[0].updatedAt).toBe(NOW)
    expect(next.slides[0].elements[0].x).toBe(5)
    expect(next.slides[0].elements[1].x).toBe(p.slides[0].elements[1].x)
  })

  it("appendElementToSlide adds to the end", () => {
    const p = presentationWithElements(["a"])
    const el = { ...createDefaultTextElement(), id: "new" }
    const next = appendElementToSlide(p, 0, el, NOW)
    expect(ids(next.slides[0].elements)).toEqual(["a", "new"])
  })

  it("appendSlide / removeSlideAt / reorderSlideAt manage the deck", () => {
    let p = presentationWithElements(["a"])
    const s2 = { ...createDefaultSlide(), id: "s2" }
    p = appendSlide(p, s2, NOW)
    expect(p.slides).toHaveLength(2)
    expect(p.updatedAt).toBe(NOW)

    const reordered = reorderSlideAt(p, 0, 1, NOW)
    expect(reordered.slides[1].id).toBe(p.slides[0].id)

    const removed = removeSlideAt(p, 0, NOW)
    expect(removed.slides).toHaveLength(1)
    expect(removed.slides[0].id).toBe("s2")
  })

  it("duplicateSlideAt inserts a re-id'd copy right after the source", () => {
    const p = presentationWithElements(["a", "b"])
    let n = 0
    const next = duplicateSlideAt(p, 0, () => `gen-${n++}`, NOW)!
    expect(next.slides).toHaveLength(2)
    const copy = next.slides[1]
    expect(copy.id).toBe("gen-0")
    expect(copy.elements.map((e) => e.id)).toEqual(["gen-1", "gen-2"])
    expect(copy.createdAt).toBe(NOW)
  })

  it("duplicateSlideAt returns null for an out-of-range index", () => {
    expect(
      duplicateSlideAt(presentationWithElements(["a"]), 9, () => "x", NOW)
    ).toBeNull()
  })
})
