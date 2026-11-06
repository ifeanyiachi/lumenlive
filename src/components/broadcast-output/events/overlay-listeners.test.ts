// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { registerOverlayListeners } from "./overlay-listeners"
import { BROADCAST_EVENTS } from "@/services/broadcast-content-gateway"
import { ASSET_REVEAL_FALLBACK_MS } from "@/lib/broadcast-output/asset-cache"
import type { OutputRuntime } from "../runtime"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import type { MediaLayerState } from "@/types/broadcast"

/**
 * Media-layer reveal-gate tests. The media layer is a backdrop composited behind
 * slide content, so the listener must hold the OUTGOING image/video until the
 * INCOMING asset can paint, then swap atomically — otherwise a redraw in the load
 * gap flashes the black floor (worse on production's asset protocol). These pin
 * that choreography by driving the captured event handler against a mock runtime.
 */

// Capture the handlers the listener registers (keyed by event name).
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (e: { payload: unknown }) => void>(),
}))

vi.mock("@/services/broadcast-content-gateway", async (orig) => {
  const actual =
    await orig<typeof import("@/services/broadcast-content-gateway")>()
  return {
    ...actual,
    listenOutputEvent: (
      event: string,
      handler: (e: { payload: unknown }) => void
    ) => {
      handlers.set(event, handler)
      return Promise.resolve(() => {})
    },
  }
})

// --- Controllable fakes for the DOM asset APIs (load fires only when we say) ---

interface FakeImg {
  crossOrigin: string
  onload: (() => void) | null
  onerror: (() => void) | null
  src: string
}
let images: FakeImg[] = []
function FakeImage(this: FakeImg) {
  this.crossOrigin = ""
  this.onload = null
  this.onerror = null
  this.src = ""
  images.push(this)
}

interface FakeVideo {
  crossOrigin: string
  muted: boolean
  loop: boolean
  playsInline: boolean
  src: string
  readyState: number
  currentTime: number
  onloadeddata: (() => void) | null
  onerror: (() => void) | null
  play: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
}
let videos: FakeVideo[] = []
function makeVideo(): FakeVideo {
  const v: FakeVideo = {
    crossOrigin: "",
    muted: false,
    loop: false,
    playsInline: false,
    src: "",
    readyState: 0,
    currentTime: 0,
    onloadeddata: null,
    onerror: null,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
  }
  videos.push(v)
  return v
}

// --- Mock runtime + render loop ------------------------------------------------

function makeRuntime() {
  return {
    imageCacheRef: { current: new Map<string, HTMLImageElement>() },
    videoCacheRef: { current: new Map<string, HTMLVideoElement>() },
    mediaLayerRef: { current: null as MediaLayerState | null },
    mediaLayerImgRef: { current: null as HTMLImageElement | null },
    mediaLayerVideoRef: { current: null as HTMLVideoElement | null },
    activeAlerts: { current: [] },
    activeCountdowns: { current: [] },
    activeProps: { current: [] },
    draw: vi.fn(),
    pushNdiBurst: vi.fn(),
    startMediaLayerVideoLoop: vi.fn(),
    logDebug: vi.fn(),
  }
}
type MockRuntime = ReturnType<typeof makeRuntime>

function makeRenderLoop() {
  return { activate: vi.fn(), deactivate: vi.fn() }
}

const imageLayer = (name: string): MediaLayerState => ({
  filePath: `${name}.png`,
  mediaType: "image",
  name,
  active: true,
})
const videoLayer = (name: string): MediaLayerState => ({
  filePath: `${name}.mp4`,
  mediaType: "video",
  name,
  active: true,
})

function fireLayer(layer: MediaLayerState | null) {
  handlers.get(BROADCAST_EVENTS.mediaLayerUpdate)!({ payload: { layer } })
}

let rt: MockRuntime
let renderLoop: ReturnType<typeof makeRenderLoop>

beforeEach(() => {
  vi.useFakeTimers()
  images = []
  videos = []
  handlers.clear()
  vi.stubGlobal("Image", FakeImage)
  const realCreate = document.createElement.bind(document)
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "video") return makeVideo() as unknown as HTMLElement
    return realCreate(tag as "div")
  }) as typeof document.createElement)
  vi.spyOn(console, "warn").mockImplementation(() => {})

  rt = makeRuntime()
  renderLoop = makeRenderLoop()
  registerOverlayListeners(
    rt as unknown as OutputRuntime,
    renderLoop as unknown as RenderLoop
  )
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("media-layer reveal gate", () => {
  it("holds the outgoing image until the new image loads, then swaps atomically", () => {
    const old = { tag: "old" } as unknown as HTMLImageElement
    rt.mediaLayerImgRef.current = old
    rt.mediaLayerRef.current = imageLayer("old")

    const next = imageLayer("next")
    fireLayer(next)

    // Held: outgoing backdrop untouched, nothing painted yet.
    expect(rt.mediaLayerImgRef.current).toBe(old)
    expect(rt.mediaLayerRef.current).toEqual(imageLayer("old"))
    expect(rt.draw).not.toHaveBeenCalled()

    // The incoming bitmap lands → atomic swap.
    images.at(-1)!.onload!()
    expect(rt.mediaLayerRef.current).toBe(next)
    expect(rt.mediaLayerImgRef.current).not.toBe(old)
    expect(rt.mediaLayerVideoRef.current).toBeNull()
    expect(renderLoop.deactivate).toHaveBeenCalledWith("mediaLayer")
    expect(rt.draw).toHaveBeenCalledTimes(1)
    expect(rt.pushNdiBurst).toHaveBeenCalledTimes(1)
  })

  it("retires the outgoing background video when swapping to an image", () => {
    const oldVideo = makeVideo()
    rt.mediaLayerVideoRef.current = oldVideo as unknown as HTMLVideoElement

    fireLayer(imageLayer("next"))
    images.at(-1)!.onload!()

    expect(oldVideo.pause).toHaveBeenCalled()
    expect(oldVideo.src).toBe("")
    expect(rt.mediaLayerVideoRef.current).toBeNull()
  })

  it("swaps a video layer on loadeddata: plays, starts the loop, updates refs", () => {
    const next = videoLayer("clip")
    fireLayer(next)

    // Held until the video can paint.
    expect(rt.draw).not.toHaveBeenCalled()
    expect(rt.startMediaLayerVideoLoop).not.toHaveBeenCalled()

    const v = videos.at(-1)!
    v.onloadeddata!()

    expect(rt.mediaLayerVideoRef.current).toBe(v)
    expect(rt.mediaLayerImgRef.current).toBeNull()
    expect(rt.mediaLayerRef.current).toBe(next)
    expect(v.play).toHaveBeenCalled()
    expect(rt.startMediaLayerVideoLoop).toHaveBeenCalledTimes(1)
    expect(rt.draw).toHaveBeenCalledTimes(1)
  })

  it("a newer update supersedes the first update's late load (seq fence)", () => {
    rt.mediaLayerRef.current = imageLayer("old")
    const a = imageLayer("A")
    const b = imageLayer("B")
    fireLayer(a) // images[0]
    fireLayer(b) // images[1]

    // A's late onload must be ignored — B is now the active update.
    images[0].onload!()
    expect(rt.mediaLayerRef.current).not.toBe(a)
    expect(rt.draw).not.toHaveBeenCalled()

    images[1].onload!()
    expect(rt.mediaLayerRef.current).toBe(b)
    expect(rt.draw).toHaveBeenCalledTimes(1)
  })

  it("clearing the layer is immediate and stops the outgoing video", () => {
    const oldVideo = makeVideo()
    rt.mediaLayerVideoRef.current = oldVideo as unknown as HTMLVideoElement
    rt.mediaLayerImgRef.current = {} as HTMLImageElement
    rt.mediaLayerRef.current = imageLayer("old")

    fireLayer(null)

    expect(rt.mediaLayerRef.current).toBeNull()
    expect(rt.mediaLayerImgRef.current).toBeNull()
    expect(rt.mediaLayerVideoRef.current).toBeNull()
    expect(oldVideo.pause).toHaveBeenCalled()
    expect(renderLoop.deactivate).toHaveBeenCalledWith("mediaLayer")
    expect(rt.draw).toHaveBeenCalledTimes(1)
  })

  it("commits the layer (black floor) when the image errors, so state isn't stuck on the old backdrop", () => {
    rt.mediaLayerImgRef.current = { tag: "old" } as unknown as HTMLImageElement
    rt.mediaLayerRef.current = imageLayer("old")

    const next = imageLayer("broken")
    fireLayer(next)
    images.at(-1)!.onerror!()

    expect(rt.mediaLayerRef.current).toBe(next)
    expect(rt.mediaLayerImgRef.current).toBeNull()
    expect(rt.draw).toHaveBeenCalledTimes(1)
  })

  it("commits the layer via the fallback if the asset stalls, then ignores a late load", () => {
    const next = imageLayer("slow")
    fireLayer(next)
    expect(rt.draw).not.toHaveBeenCalled()

    vi.advanceTimersByTime(ASSET_REVEAL_FALLBACK_MS)
    expect(rt.mediaLayerRef.current).toBe(next)
    expect(rt.mediaLayerImgRef.current).toBeNull()
    expect(rt.draw).toHaveBeenCalledTimes(1)

    // A load arriving after the fallback must not double-apply (idempotent).
    images.at(-1)!.onload!()
    expect(rt.draw).toHaveBeenCalledTimes(1)
  })
})
