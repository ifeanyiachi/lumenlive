import { describe, it, expect, vi } from "vitest"
import type { Slide } from "@/types/slide"

const { calls } = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock("@/lib/slide-renderer", () => ({
  drawSlideElements: vi.fn((...args: unknown[]) => calls.push(args)),
}))

const { snapshotCanvas, snapshotSlideElements } = await import("./transitions")

function fakeCanvas() {
  const ops: string[] = []
  const ctx = {
    drawImage: (...a: unknown[]) => ops.push(`drawImage(${a.length})`),
    clearRect: (...a: number[]) => ops.push(`clearRect(${a.join(",")})`),
  }
  const c = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    __ops: ops,
  }
  return c as unknown as HTMLCanvasElement & { __ops: string[] }
}

describe("snapshotCanvas", () => {
  it("resizes prev to match the source and copies it in", () => {
    const source = fakeCanvas()
    source.width = 1280
    source.height = 720
    const prev = fakeCanvas()
    snapshotCanvas(prev, source)
    expect(prev.width).toBe(1280)
    expect(prev.height).toBe(720)
    expect(prev.__ops).toEqual(["drawImage(3)"])
  })
})

describe("snapshotSlideElements", () => {
  it("sizes prev to the surface, clears it, then draws only the elements", () => {
    calls.length = 0
    const prev = fakeCanvas()
    const slide = { name: "S", elements: [] } as unknown as Slide
    const caches = { imageCache: new Map(), videoCache: new Map() }
    snapshotSlideElements(prev, slide, 1600, 900, caches)
    expect(prev.width).toBe(1600)
    expect(prev.height).toBe(900)
    expect(prev.__ops).toEqual(["clearRect(0,0,1600,900)"])
    // drawSlideElements(ctx, slide, w, h, caches)
    expect(calls).toHaveLength(1)
    expect(calls[0][1]).toBe(slide)
    expect(calls[0][2]).toBe(1600)
    expect(calls[0][3]).toBe(900)
    expect(calls[0][4]).toBe(caches)
  })
})
