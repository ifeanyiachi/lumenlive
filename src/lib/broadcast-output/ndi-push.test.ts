import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { captureAndSendNdiFrame } from "./ndi-push"

// A fake canvas whose ctx records draw ops and returns a labeled ImageData buffer.
function fakeCanvas(width: number, height: number, label: string) {
  const ops: string[] = []
  const ctx = {
    drawImage: (...a: unknown[]) => ops.push(`drawImage(${a.length})`),
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      ops.push(`getImageData(${w},${h})`)
      return {
        data: { buffer: `${label}:${w}x${h}` as unknown as ArrayBuffer },
      }
    },
  }
  const c = {
    width,
    height,
    getContext: () => ctx,
    __ops: ops,
  }
  return c as unknown as HTMLCanvasElement & { __ops: string[] }
}

// document.createElement("canvas") → a fresh scratch fake canvas.
let createdCanvases: (HTMLCanvasElement & { __ops: string[] })[] = []
beforeEach(() => {
  createdCanvases = []
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`unexpected createElement(${tag})`)
      const c = fakeCanvas(0, 0, "scratch")
      createdCanvases.push(c)
      return c
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe("captureAndSendNdiFrame — keyed path", () => {
  it("draws the foreground onto a target-sized scratch canvas and sends it", async () => {
    const sent: [ArrayBuffer, number, number][] = []
    const drawForeground = vi.fn()
    const scratch = { current: null as HTMLCanvasElement | null }
    const ok = await captureAndSendNdiFrame({
      targetWidth: 1920,
      targetHeight: 1080,
      keyed: true,
      drawForeground,
      sourceCanvas: null,
      scratch,
      send: (buf, w, h) => {
        sent.push([buf, w, h])
        return Promise.resolve()
      },
    })
    expect(ok).toBe(true)
    expect(drawForeground).toHaveBeenCalledWith(expect.anything(), 1920, 1080)
    expect(scratch.current).toBe(createdCanvases[0])
    expect(scratch.current!.width).toBe(1920)
    expect(sent).toEqual([["scratch:1920x1080", 1920, 1080]])
  })
})

describe("captureAndSendNdiFrame — opaque path", () => {
  it("reads the live canvas directly when its size matches the target", async () => {
    const source = fakeCanvas(1920, 1080, "live")
    const sent: [ArrayBuffer, number, number][] = []
    const scratch = { current: null as HTMLCanvasElement | null }
    const ok = await captureAndSendNdiFrame({
      targetWidth: 1920,
      targetHeight: 1080,
      keyed: false,
      drawForeground: vi.fn(),
      sourceCanvas: source,
      scratch,
      send: (buf, w, h) => {
        sent.push([buf, w, h])
        return Promise.resolve()
      },
    })
    expect(ok).toBe(true)
    // No scratch canvas created; read straight from the live canvas.
    expect(createdCanvases).toHaveLength(0)
    expect(sent).toEqual([["live:1920x1080", 1920, 1080]])
  })

  it("scales through the scratch canvas when the size differs", async () => {
    const source = fakeCanvas(1280, 720, "live")
    const sent: [ArrayBuffer, number, number][] = []
    const scratch = { current: null as HTMLCanvasElement | null }
    const ok = await captureAndSendNdiFrame({
      targetWidth: 1920,
      targetHeight: 1080,
      keyed: false,
      drawForeground: vi.fn(),
      sourceCanvas: source,
      scratch,
      send: (buf, w, h) => {
        sent.push([buf, w, h])
        return Promise.resolve()
      },
    })
    expect(ok).toBe(true)
    expect(scratch.current).toBe(createdCanvases[0])
    expect(createdCanvases[0].__ops).toContain("drawImage(5)")
    expect(sent).toEqual([["scratch:1920x1080", 1920, 1080]])
  })

  it("bails (no send) when there is no source canvas", async () => {
    const send = vi.fn(() => Promise.resolve())
    const ok = await captureAndSendNdiFrame({
      targetWidth: 1920,
      targetHeight: 1080,
      keyed: false,
      drawForeground: vi.fn(),
      sourceCanvas: null,
      scratch: { current: null },
      send,
    })
    expect(ok).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it("reuses the existing scratch canvas across scaled pushes", async () => {
    const source = fakeCanvas(1280, 720, "live")
    const existing = fakeCanvas(0, 0, "reused")
    const scratch = { current: existing as HTMLCanvasElement }
    await captureAndSendNdiFrame({
      targetWidth: 1920,
      targetHeight: 1080,
      keyed: false,
      drawForeground: vi.fn(),
      sourceCanvas: source,
      scratch,
      send: () => Promise.resolve(),
    })
    // Reused the passed-in scratch rather than creating a new canvas.
    expect(createdCanvases).toHaveLength(0)
    expect(scratch.current).toBe(existing)
  })
})
