import { describe, it, expect } from "vitest"
import {
  projectElementToSurface,
  deriveElementAnchor,
} from "./project-element"
import type { ThemeElement } from "@/types/broadcast"
import type { CanvasAnchor } from "@/types/canvas"

const AUTHORED = { width: 1920, height: 1080 }

function el(
  over: Partial<ThemeElement> & Pick<ThemeElement, "x" | "y" | "width" | "height">
): ThemeElement {
  return {
    id: "e1",
    name: "el",
    visible: true,
    locked: false,
    type: "image",
    ...over,
  }
}

describe("deriveElementAnchor", () => {
  const cases: Array<[Partial<ThemeElement> & Record<"x" | "y" | "width" | "height", number>, CanvasAnchor]> = [
    [{ x: 1670, y: 50, width: 200, height: 100 }, "top-right"],
    [{ x: 50, y: 50, width: 200, height: 100 }, "top-left"],
    [{ x: 860, y: 40, width: 200, height: 100 }, "top-center"],
    [{ x: 50, y: 900, width: 200, height: 100 }, "bottom-left"],
    [{ x: 1670, y: 900, width: 200, height: 100 }, "bottom-right"],
    [{ x: 860, y: 490, width: 200, height: 100 }, "center"],
  ]
  it.each(cases)("maps %o to %s", (box, expected) => {
    expect(deriveElementAnchor(box, AUTHORED)).toBe(expected)
  })
})

describe("projectElementToSurface", () => {
  it("is byte-identical at the authored resolution (any anchor)", () => {
    const e = el({ x: 100, y: 50, width: 200, height: 80, anchor: "top-right" })
    const p = projectElementToSurface(e, AUTHORED, AUTHORED)
    expect(p.x).toBeCloseTo(100, 6)
    expect(p.y).toBeCloseTo(50, 6)
    expect(p.width).toBeCloseTo(200, 6)
    expect(p.height).toBeCloseTo(80, 6)
  })

  it("reduces to uniform scaling on a larger 16:9 surface (anchor-independent)", () => {
    const base = { x: 100, y: 50, width: 200, height: 80 }
    const surface = { width: 3840, height: 2160 } // 2x, still 16:9
    const anchors: CanvasAnchor[] = ["top-left", "top-right", "center", "bottom-right"]
    for (const anchor of anchors) {
      const p = projectElementToSurface(el({ ...base, anchor }), AUTHORED, surface)
      expect(p.x, anchor).toBeCloseTo(200, 4)
      expect(p.y, anchor).toBeCloseTo(100, 4)
      expect(p.width, anchor).toBeCloseTo(400, 4)
      expect(p.height, anchor).toBeCloseTo(160, 4)
    }
  })

  it("pins a right-anchored element to the right edge on a wider surface", () => {
    // 50px right margin at 1920 → 50px right margin at 2560 (fontScale = 1).
    const e = el({ x: 1670, y: 50, width: 200, height: 100, anchor: "top-right" })
    const p = projectElementToSurface(e, AUTHORED, { width: 2560, height: 1080 })
    expect(2560 - (p.x + p.width)).toBeCloseTo(50, 4) // right margin preserved
    expect(p.width).toBeCloseTo(200, 4) // fontScale 1 → unchanged size
  })

  it("keeps a left-anchored element at its left margin on a wider surface", () => {
    const e = el({ x: 50, y: 50, width: 200, height: 100, anchor: "top-left" })
    const p = projectElementToSurface(e, AUTHORED, { width: 2560, height: 1080 })
    expect(p.x).toBeCloseTo(50, 4)
  })

  it("keeps a centered element centered on a wider surface", () => {
    const e = el({ x: 860, y: 50, width: 200, height: 100, anchor: "center" })
    const p = projectElementToSurface(e, AUTHORED, { width: 2560, height: 1080 })
    expect(p.x + p.width / 2).toBeCloseTo(2560 / 2, 4) // element center = surface center
  })

  it("keeps authored pixel size when sizeMode is fixed", () => {
    const e = el({
      x: 100,
      y: 50,
      width: 200,
      height: 80,
      anchor: "top-left",
      sizeMode: "fixed",
    })
    const p = projectElementToSurface(e, AUTHORED, { width: 3840, height: 2160 })
    expect(p.width).toBe(200)
    expect(p.height).toBe(80)
  })

  it("derives the anchor when the element has none", () => {
    // Top-right element, no explicit anchor → treated as top-right, pinned right.
    const e = el({ x: 1670, y: 50, width: 200, height: 100 })
    const p = projectElementToSurface(e, AUTHORED, { width: 2560, height: 1080 })
    expect(2560 - (p.x + p.width)).toBeCloseTo(50, 4)
  })
})
