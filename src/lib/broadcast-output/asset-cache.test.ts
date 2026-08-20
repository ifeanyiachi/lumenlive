import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  preloadImage,
  preloadVideoBackground,
  preloadSlideAssets,
} from "./asset-cache"

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

describe("preloadSlideAssets (slide-model / RF3a)", () => {
  it("loads a slide image background and every image element by imageUrl", () => {
    const cache = new Map<string, HTMLImageElement>()
    const source = {
      background: { type: "image" as const, imageUrl: "bg.png" },
      elements: [
        { type: "image", imageUrl: "el1.png" },
        { type: "shape" },
        { type: "image", imageUrl: "el2.png" },
      ],
    } as unknown as Parameters<typeof preloadSlideAssets>[0]
    preloadSlideAssets(source, cache)
    expect([...cache.keys()].sort()).toEqual(["bg.png", "el1.png", "el2.png"])
  })

  it("does not touch the image cache for a video background (video renders from the live video cache)", () => {
    const cache = new Map<string, HTMLImageElement>()
    const source = {
      background: { type: "video" as const, videoUrl: "bg.mp4" },
      elements: [],
    } as unknown as Parameters<typeof preloadSlideAssets>[0]
    preloadSlideAssets(source, cache)
    expect(cache.size).toBe(0)
  })
})
