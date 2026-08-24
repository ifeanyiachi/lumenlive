// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { registerVisibilityListeners } from "./visibility-listeners"
import { BROADCAST_EVENTS } from "@/services/broadcast-content-gateway"
import { ASSET_REVEAL_FALLBACK_MS } from "@/lib/broadcast-output/asset-cache"
import type { OutputRuntime } from "../runtime"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import type { Theme } from "@/types/theme"
import type { SlideBackground } from "@/types/slide"

/**
 * Base/master-theme reveal-gate tests. The base theme is the backdrop behind Clear
 * and transparent content; the listener must hold the OUTGOING theme until the
 * INCOMING background can paint (image cached / video buffered / synchronous type),
 * then swap — otherwise an image/video base flashes its black placeholder while the
 * asset decodes. These pin that choreography against a mock runtime.
 */

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

// --- Controllable fakes (load fires only when we say) --------------------------

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
    baseThemeRef: { current: null as Theme | null },
    drawRef: { current: vi.fn() },
    pushNdiBurst: vi.fn(),
    preloadBaseThemeImages: vi.fn(),
    logDebug: vi.fn(),
  }
}
type MockRuntime = ReturnType<typeof makeRuntime>

function makeRenderLoop() {
  return { activate: vi.fn(), deactivate: vi.fn() }
}

const theme = (id: string, background: SlideBackground): Theme =>
  ({ id, name: id, background }) as unknown as Theme

function fireTheme(t: Theme) {
  handlers.get(BROADCAST_EVENTS.baseTheme)!({ payload: { theme: t } })
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
  registerVisibilityListeners(
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

describe("base-theme reveal gate", () => {
  it("applies a synchronous (solid) background immediately", () => {
    const t = theme("solid1", { type: "solid", color: "#123" })
    fireTheme(t)

    expect(rt.baseThemeRef.current).toBe(t)
    expect(renderLoop.deactivate).toHaveBeenCalledWith("baseVideo")
    expect(renderLoop.activate).not.toHaveBeenCalled()
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
    expect(rt.pushNdiBurst).toHaveBeenCalledTimes(1)
  })

  it("applies an animated background immediately and runs the baseVideo loop", () => {
    const t = theme("anim1", { type: "animated" } as SlideBackground)
    fireTheme(t)

    expect(rt.baseThemeRef.current).toBe(t)
    expect(renderLoop.activate).toHaveBeenCalledWith("baseVideo", {
      push: false,
    })
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
  })

  it("holds the previous theme until an image background loads, then swaps", () => {
    const old = theme("old", { type: "solid", color: "#000" })
    rt.baseThemeRef.current = old

    const next = theme("img1", { type: "image", imageUrl: "bg.png" })
    fireTheme(next)

    // Held: previous theme still shown, nothing painted.
    expect(rt.baseThemeRef.current).toBe(old)
    expect(rt.drawRef.current).not.toHaveBeenCalled()

    images.at(-1)!.onload!()
    expect(rt.baseThemeRef.current).toBe(next)
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
  })

  it("applies immediately when the image background is already cached", () => {
    rt.imageCacheRef.current.set("warm.png", {} as HTMLImageElement)
    const t = theme("img2", { type: "image", imageUrl: "warm.png" })
    fireTheme(t)

    expect(rt.baseThemeRef.current).toBe(t)
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
    // No preload image needed for a warm cache.
    expect(images.length).toBe(0)
  })

  it("holds until a video background is buffered, then swaps and runs the loop", () => {
    const old = theme("old", { type: "solid", color: "#000" })
    rt.baseThemeRef.current = old

    const next = theme("vid1", { type: "video", videoUrl: "bg.mp4" })
    fireTheme(next)

    expect(rt.baseThemeRef.current).toBe(old)
    expect(rt.drawRef.current).not.toHaveBeenCalled()

    videos.at(-1)!.onloadeddata!()
    expect(rt.baseThemeRef.current).toBe(next)
    expect(rt.videoCacheRef.current.get("bg.mp4")).toBeDefined()
    expect(renderLoop.activate).toHaveBeenCalledWith("baseVideo", {
      push: false,
    })
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
  })

  it("a newer base-theme supersedes the first's late image load (seq fence)", () => {
    const a = theme("A", { type: "image", imageUrl: "a.png" })
    const b = theme("B", { type: "image", imageUrl: "b.png" })
    fireTheme(a) // images[0]
    fireTheme(b) // images[1]

    images[0].onload!()
    expect(rt.baseThemeRef.current).not.toBe(a)
    expect(rt.drawRef.current).not.toHaveBeenCalled()

    images[1].onload!()
    expect(rt.baseThemeRef.current).toBe(b)
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
  })

  it("applies via the fallback if the background asset stalls, then ignores a late load", () => {
    const next = theme("slow", { type: "image", imageUrl: "slow.png" })
    fireTheme(next)
    expect(rt.drawRef.current).not.toHaveBeenCalled()

    vi.advanceTimersByTime(ASSET_REVEAL_FALLBACK_MS)
    expect(rt.baseThemeRef.current).toBe(next)
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)

    images.at(-1)!.onload!()
    expect(rt.drawRef.current).toHaveBeenCalledTimes(1)
  })
})
