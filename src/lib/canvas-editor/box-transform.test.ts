import { describe, it, expect } from "vitest"
import {
  moveBox,
  resizeBoxCorner,
  MIN_BOX_SIZE,
  type BoxCorner,
  type BoxRect,
} from "./box-transform"

// ── Reference oracle ──────────────────────────────────────────────────────
// These reproduce, verbatim, the element move/resize arithmetic that lived
// inline in theme-canvas-overlay.tsx (the `handlePointerMove` element branch,
// pre-extraction). The extracted functions must equal this across a grid so we
// know the refactor is byte-identical.

function legacyMove(orig: BoxRect, dxPx: number, dyPx: number) {
  return {
    x: Math.round(orig.x + dxPx),
    y: Math.round(orig.y + dyPx),
  }
}

function legacyResize(
  orig: BoxRect,
  corner: BoxCorner,
  dxPx: number,
  dyPx: number
): BoxRect {
  let newX = orig.x,
    newY = orig.y
  let newW = orig.width,
    newH = orig.height
  if (corner === "se" || corner === "ne") newW = Math.max(20, orig.width + dxPx)
  if (corner === "nw" || corner === "sw") {
    newW = Math.max(20, orig.width - dxPx)
    newX = orig.x + orig.width - newW
  }
  if (corner === "se" || corner === "sw")
    newH = Math.max(20, orig.height + dyPx)
  if (corner === "nw" || corner === "ne") {
    newH = Math.max(20, orig.height - dyPx)
    newY = orig.y + orig.height - newH
  }
  return {
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newW),
    height: Math.round(newH),
  }
}

// ── Grid ──────────────────────────────────────────────────────────────────
const BOXES: BoxRect[] = [
  { x: 0, y: 0, width: 100, height: 100 },
  { x: 250, y: 120, width: 640, height: 360 },
  { x: 1800, y: 1000, width: 60, height: 40 },
  { x: 33, y: 77, width: 25, height: 22 }, // near the min clamp
  { x: 500.4, y: 300.6, width: 200.5, height: 150.5 }, // fractional origin
]
const CORNERS: BoxCorner[] = ["nw", "ne", "sw", "se"]
const DELTAS = [-500, -137, -20, -1, 0, 1, 20, 137.3, 500, 2000]

describe("moveBox parity", () => {
  it("matches the legacy move math across the grid", () => {
    for (const box of BOXES) {
      for (const dx of DELTAS) {
        for (const dy of DELTAS) {
          expect(moveBox(box, dx, dy)).toEqual(legacyMove(box, dx, dy))
        }
      }
    }
  })
})

describe("resizeBoxCorner parity", () => {
  it("matches the legacy resize math across corners and deltas", () => {
    for (const box of BOXES) {
      for (const corner of CORNERS) {
        for (const dx of DELTAS) {
          for (const dy of DELTAS) {
            expect(resizeBoxCorner(box, corner, dx, dy)).toEqual(
              legacyResize(box, corner, dx, dy)
            )
          }
        }
      }
    }
  })
})

describe("resizeBoxCorner behaviour", () => {
  it("never shrinks below MIN_BOX_SIZE", () => {
    const box: BoxRect = { x: 100, y: 100, width: 50, height: 50 }
    // Per corner, the delta signs that shrink BOTH dimensions differ, because
    // each axis is added or subtracted depending on which corner is dragged.
    const shrinkDelta: Record<BoxCorner, [number, number]> = {
      se: [-9999, -9999],
      nw: [9999, 9999],
      ne: [-9999, 9999],
      sw: [9999, -9999],
    }
    for (const corner of CORNERS) {
      const [dx, dy] = shrinkDelta[corner]
      const r = resizeBoxCorner(box, corner, dx, dy)
      expect(r.width).toBe(MIN_BOX_SIZE)
      expect(r.height).toBe(MIN_BOX_SIZE)
    }
  })

  it("keeps the opposite corner fixed when shrinking from nw", () => {
    const box: BoxRect = { x: 100, y: 100, width: 200, height: 200 }
    const r = resizeBoxCorner(box, "nw", 40, 40)
    // se corner (x+w, y+h) must stay at (300, 300)
    expect(r.x + r.width).toBe(300)
    expect(r.y + r.height).toBe(300)
  })

  it("leaves the top-left fixed when resizing from se", () => {
    const box: BoxRect = { x: 100, y: 100, width: 200, height: 200 }
    const r = resizeBoxCorner(box, "se", 40, 40)
    expect(r.x).toBe(100)
    expect(r.y).toBe(100)
    expect(r.width).toBe(240)
    expect(r.height).toBe(240)
  })
})
