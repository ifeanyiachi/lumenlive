// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { acquireOffscreenCanvas, type CanvasHolder } from "./offscreen-canvas"

// A canvas stand-in that records width/height assignments and hands back a ctx
// with a spyable clearRect, so we can assert the resize-vs-clear branches
// precisely (jsdom's real canvas has no 2d backend and can't track assigns).
class FakeCanvas {
  private _w = 0
  private _h = 0
  widthAssigns = 0
  heightAssigns = 0
  clearRect = vi.fn()
  get width() {
    return this._w
  }
  set width(v: number) {
    this._w = v
    this.widthAssigns++
  }
  get height() {
    return this._h
  }
  set height(v: number) {
    this._h = v
    this.heightAssigns++
  }
  getContext() {
    return { clearRect: this.clearRect }
  }
}

function seeded(): { holder: CanvasHolder; fake: FakeCanvas } {
  const fake = new FakeCanvas()
  return { holder: { current: fake as unknown as HTMLCanvasElement }, fake }
}

describe("acquireOffscreenCanvas", () => {
  it("creates a canvas on first use and sizes it", () => {
    const holder: CanvasHolder = { current: null }
    const canvas = acquireOffscreenCanvas(holder, 1920, 1080)
    expect(holder.current).toBe(canvas)
    expect(canvas.width).toBe(1920)
    expect(canvas.height).toBe(1080)
  })

  it("reuses the same instance across calls", () => {
    const holder: CanvasHolder = { current: null }
    const a = acquireOffscreenCanvas(holder, 1920, 1080)
    const b = acquireOffscreenCanvas(holder, 1920, 1080)
    expect(b).toBe(a)
  })

  it("does not reassign width/height when unchanged", () => {
    const { holder, fake } = seeded()
    acquireOffscreenCanvas(holder, 1920, 1080) // 0->1920, 0->1080
    acquireOffscreenCanvas(holder, 1920, 1080) // unchanged
    expect(fake.widthAssigns).toBe(1)
    expect(fake.heightAssigns).toBe(1)
  })

  it("resizes only the changed dimension", () => {
    const { holder, fake } = seeded()
    acquireOffscreenCanvas(holder, 1920, 1080)
    acquireOffscreenCanvas(holder, 1280, 1080) // only width changes
    expect(fake.widthAssigns).toBe(2)
    expect(fake.heightAssigns).toBe(1)
  })

  it("clears manually when dimensions are unchanged (blank surface)", () => {
    const { holder, fake } = seeded()
    acquireOffscreenCanvas(holder, 1920, 1080)
    fake.clearRect.mockClear()
    acquireOffscreenCanvas(holder, 1920, 1080, true)
    expect(fake.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080)
  })

  it("skips the manual clear when a resize already cleared the canvas", () => {
    const { holder, fake } = seeded()
    acquireOffscreenCanvas(holder, 1920, 1080)
    fake.clearRect.mockClear()
    acquireOffscreenCanvas(holder, 1280, 720, true) // resized -> auto-cleared
    expect(fake.clearRect).not.toHaveBeenCalled()
  })

  it("skips the manual clear when clear=false", () => {
    const { holder, fake } = seeded()
    acquireOffscreenCanvas(holder, 1920, 1080)
    fake.clearRect.mockClear()
    acquireOffscreenCanvas(holder, 1920, 1080, false)
    expect(fake.clearRect).not.toHaveBeenCalled()
  })
})
