import { describe, it, expect } from "vitest"
import { migrateSlideElements } from "./slide-migration"
import { createDefaultPresentation } from "./slide-defaults"
import type { Presentation, SlideElement } from "@/types/slide"

describe("migrateSlideElements", () => {
  it("returns the same array (no copy) when every element is already typed", () => {
    const presentations = [createDefaultPresentation("A")]
    // Nothing to migrate → identity return, so hydration does no needless work.
    expect(migrateSlideElements(presentations)).toBe(presentations)
  })

  it("migrates a legacy element that lacks the `type` discriminator to text", () => {
    // A pre-migration element persisted before the discriminated union existed.
    const legacy = {
      id: "e1",
      text: "Legacy text",
      x: 5,
      y: 10,
      width: 50,
      height: 20,
      color: "#abcdef",
      fontSize: 60,
    } as unknown as SlideElement

    const presentations: Presentation[] = [
      {
        id: "p1",
        name: "P",
        createdAt: 0,
        updatedAt: 0,
        slides: [
          {
            id: "s1",
            name: "S",
            background: { type: "solid", color: "#000000" },
            elements: [legacy],
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      },
    ]

    const result = migrateSlideElements(presentations)
    expect(result).not.toBe(presentations) // a change happened → new array
    const el = result[0].slides[0].elements[0]
    expect(el.type).toBe("text")
    expect(el.id).toBe("e1")
    if (el.type === "text") {
      expect(el.text).toBe("Legacy text")
      expect(el.color).toBe("#abcdef")
      expect(el.fontSize).toBe(60)
      // Missing fields fall back to defaults.
      expect(el.fontFamily).toBe("Inter")
    }
  })

  it("leaves already-typed elements untouched within a mixed presentation", () => {
    const typed: SlideElement = {
      id: "t1",
      type: "shape",
      shapeType: "rounded-rect",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      fillColor: "#fff",
      strokeColor: "#000",
      strokeWidth: 1,
      opacity: 1,
      borderRadius: 4,
    }
    const legacy = { id: "l1", text: "x" } as unknown as SlideElement
    const presentations: Presentation[] = [
      {
        id: "p1",
        name: "P",
        createdAt: 0,
        updatedAt: 0,
        slides: [
          {
            id: "s1",
            name: "S",
            background: { type: "solid", color: "#000000" },
            elements: [typed, legacy],
            createdAt: 0,
            updatedAt: 0,
          },
        ],
      },
    ]
    const [migratedTyped, migratedLegacy] =
      migrateSlideElements(presentations)[0].slides[0].elements
    expect(migratedTyped).toBe(typed) // identity preserved for typed element
    expect(migratedLegacy.type).toBe("text")
  })
})
