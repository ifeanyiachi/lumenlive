import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  preloadImage,
  preloadVideoBackground,
  preloadThemeAssets,
} from "./asset-cache"
import type { BroadcastTheme } from "@/types/broadcast"

// --- Fakes for the DOM asset APIs (absent in the node test env) -------------

class FakeImage {
  crossOrigin = ""
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ""
  set src(v: string) {
    this._src = v
    // Synchronous "load" so tests can assert the cache is populated inline.
    this.onload?.()
  }
  get src() {
    return this._src
  }
}

interface FakeVideo {
  crossOrigin: string
  src: string
  muted: boolean
  loop: boolean
  playsInline: boolean
  play: () => Promise<void>
  load: () => void
  addEventListener: (ev: string, cb: () => void, opts?: unknown) => void
}

let lastVideo: FakeVideo | null = null

function makeFakeVideo(): FakeVideo {
  let canplay: (() => void) | null = null
  const v: FakeVideo = {
    crossOrigin: "",
    src: "",
    muted: false,
    loop: false,
    playsInline: false,
    play: () => Promise.resolve(),
    load: () => canplay?.(), // fire canplay synchronously on load()
    addEventListener: (ev, cb) => {
      if (ev === "canplay") canplay = cb
    },
  }
  return v
}

beforeEach(() => {
  vi.stubGlobal("Image", FakeImage)
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag === "video") {
        lastVideo = makeFakeVideo()
        return lastVideo
      }
      throw new Error(`unexpected createElement(${tag})`)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  lastVideo = null
})

describe("preloadImage", () => {
  it("caches the image and fires onLoaded, CORS-clean", () => {
    const cache = new Map<string, HTMLImageElement>()
    const onLoaded = vi.fn()
    preloadImage(cache, "a.png", onLoaded)
    expect(cache.has("a.png")).toBe(true)
    expect(cache.get("a.png")!.crossOrigin).toBe("anonymous")
    expect(onLoaded).toHaveBeenCalledTimes(1)
  })

  it("no-ops on an empty url or a cache hit", () => {
    const cache = new Map<string, HTMLImageElement>()
    const onLoaded = vi.fn()
    preloadImage(cache, undefined, onLoaded)
    preloadImage(cache, "", onLoaded)
    expect(cache.size).toBe(0)
    expect(onLoaded).not.toHaveBeenCalled()

    cache.set("x.png", {} as HTMLImageElement)
    preloadImage(cache, "x.png", onLoaded)
    expect(onLoaded).not.toHaveBeenCalled()
  })
})

describe("preloadVideoBackground", () => {
  it("caches under the video: key, autoplays, and fires onLoaded", () => {
    const cache = new Map<string, HTMLImageElement>()
    const onLoaded = vi.fn()
    preloadVideoBackground(cache, "clip.mp4", onLoaded)
    expect(cache.has("video:clip.mp4")).toBe(true)
    expect(lastVideo!.muted).toBe(true)
    expect(lastVideo!.loop).toBe(true)
    expect(lastVideo!.crossOrigin).toBe("anonymous")
    expect(onLoaded).toHaveBeenCalledTimes(1)
  })

  it("no-ops on a cache hit", () => {
    const cache = new Map<string, HTMLImageElement>()
    cache.set("video:clip.mp4", {} as HTMLImageElement)
    const onLoaded = vi.fn()
    preloadVideoBackground(cache, "clip.mp4", onLoaded)
    expect(onLoaded).not.toHaveBeenCalled()
  })
})

describe("preloadThemeAssets", () => {
  it("loads an image background and every decorative image element", () => {
    const cache = new Map<string, HTMLImageElement>()
    const theme = {
      id: "t",
      background: { type: "image", image: { url: "bg.png" } },
      elements: [
        { type: "image", image: { url: "el1.png" } },
        { type: "shape" },
        { type: "image", image: { url: "el2.png" } },
      ],
    } as unknown as BroadcastTheme
    preloadThemeAssets(theme, cache)
    expect([...cache.keys()].sort()).toEqual(["bg.png", "el1.png", "el2.png"])
  })

  it("loads a video background under the video: key", () => {
    const cache = new Map<string, HTMLImageElement>()
    const theme = {
      id: "t",
      background: { type: "video", video: { url: "bg.mp4" } },
      elements: [],
    } as unknown as BroadcastTheme
    preloadThemeAssets(theme, cache)
    expect(cache.has("video:bg.mp4")).toBe(true)
  })
})
