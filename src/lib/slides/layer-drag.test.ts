// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import {
  captureLayerRowRects,
  pickLayerIndexAtY,
  type LayerRowRect,
} from "./layer-drag"

const rects: LayerRowRect[] = [
  { idx: 0, top: 0, bottom: 20 },
  { idx: 1, top: 20, bottom: 40 },
  { idx: 2, top: 40, bottom: 60 },
]

describe("pickLayerIndexAtY", () => {
  it("returns the index of the containing row", () => {
    expect(pickLayerIndexAtY(rects, 10)).toBe(0)
    expect(pickLayerIndexAtY(rects, 30)).toBe(1)
    expect(pickLayerIndexAtY(rects, 50)).toBe(2)
  })

  it("uses a half-open [top, bottom) interval at boundaries", () => {
    // top is inclusive, bottom is exclusive — a Y on a shared edge belongs to
    // the lower row, matching the original per-move scan.
    expect(pickLayerIndexAtY(rects, 20)).toBe(1)
    expect(pickLayerIndexAtY(rects, 40)).toBe(2)
    expect(pickLayerIndexAtY(rects, 0)).toBe(0)
  })

  it("returns null when the pointer is outside every row", () => {
    expect(pickLayerIndexAtY(rects, -5)).toBeNull()
    expect(pickLayerIndexAtY(rects, 60)).toBeNull()
    expect(pickLayerIndexAtY([], 10)).toBeNull()
  })

  it("returns the first matching row when rects overlap", () => {
    const overlapping: LayerRowRect[] = [
      { idx: 0, top: 0, bottom: 30 },
      { idx: 1, top: 20, bottom: 50 },
    ]
    expect(pickLayerIndexAtY(overlapping, 25)).toBe(0)
  })
})

describe("captureLayerRowRects", () => {
  it("snapshots idx + vertical bounds for each [data-layer-idx] row", () => {
    const list = document.createElement("div")
    for (let i = 0; i < 3; i++) {
      const row = document.createElement("div")
      row.dataset.layerIdx = String(i)
      // jsdom returns all-zero rects, but stub per-row so we assert the mapping.
      row.getBoundingClientRect = () =>
        ({ top: i * 20, bottom: i * 20 + 20 }) as DOMRect
      list.appendChild(row)
    }
    // A row without the marker attribute is ignored.
    const extra = document.createElement("div")
    extra.getBoundingClientRect = () => ({ top: 999, bottom: 1000 }) as DOMRect
    list.appendChild(extra)

    expect(captureLayerRowRects(list)).toEqual([
      { idx: 0, top: 0, bottom: 20 },
      { idx: 1, top: 20, bottom: 40 },
      { idx: 2, top: 40, bottom: 60 },
    ])
  })
})
