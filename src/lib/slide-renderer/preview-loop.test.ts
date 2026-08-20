// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { Slide } from "@/types/slide"

/**
 * Tests for the shared operator slide-preview loop (D1) and a cross-surface parity
 * guard proving the operator preview and the audience/NDI output draw a static
 * slide identically.
 *
 * `runSlidePreviewEffect` is the exact effect body the two operator canvases used
 * to inline; these lock its branch behaviour (static / animated / video, cached
 * and uncached) and its cleanup. Since both `SlideCanvas` consumers now share this
 * one path, "preview frame == live frame" holds by construction; the parity
 * `describe` at the bottom closes the third surface (output-window compositor).
 */

// A barrel mock only affects the compositor (which imports `renderSlide` from the
// barrel); `preview-loop` imports its predicates from `./predicates` directly, so
// the loop tests below exercise the real predicates.
const { renderSlideCalls } = vi.hoisted(() => ({
  renderSlideCalls: [] as unknown[][],
}))
vi.mock("@/lib/slide-renderer", () => ({
  renderSlide: vi.fn((...args: unknown[]) => {
    renderSlideCalls.push(args)
  }),
  drawSlideElements: vi.fn(),
}))

// Keep image preloading synchronous + observable (avoids real `Image()`/network).
const { ensureSpy } = vi.hoisted(() => ({ ensureSpy: vi.fn() }))
vi.mock("@/lib/slide-image-cache", () => ({
  ensureSlideImages: (url: string | undefined, cb: () => void) =>
    ensureSpy(url, cb),
}))

const { runSlidePreviewEffect } = await import("./preview-loop")

// --- Fake RAF clock ---------------------------------------------------------

let rafQueue: Array<() => void>
let rafSeq: number
let cancelSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  rafQueue = []
  rafSeq = 0
  cancelSpy = vi.fn()
  ensureSpy.mockClear()
  renderSlideCalls.length = 0
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafQueue.push(() => cb(0))
    return ++rafSeq
  })
  vi.stubGlobal("cancelAnimationFrame", cancelSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Run every currently-queued frame callback exactly once. */
function flushOneFrame() {
  const q = rafQueue
  rafQueue = []
  for (const fn of q) fn()
}

// --- Fixtures ---------------------------------------------------------------

const staticSlide = () =>
  ({ background: { type: "solid" }, elements: [] }) as unknown as Slide
const animatedSlide = () =>
  ({
    background: { type: "animated", animated: { preset: "aurora" } },
    elements: [],
  }) as unknown as Slide
const videoSlide = (videoUrl = "bg.mp4") =>
  ({
    background: { type: "video", videoUrl },
    elements: [],
  }) as unknown as Slide
const imageSlide = () =>
  ({
    background: { type: "image", imageUrl: "bg.png" },
    elements: [{ type: "image", imageUrl: "el.png" }],
  }) as unknown as Slide

function makeRefs(
  over: Partial<Parameters<typeof runSlidePreviewEffect>[2]> = {}
) {
  return {
    rafRef: { current: 0 },
    videoRef: { current: null as HTMLVideoElement | null },
    videoCache: new Map<string, HTMLVideoElement>(),
    ...over,
  }
}

/** Minimal controllable stand-in for a background `<video>`. */
function fakeVideo() {
  return {
    muted: false,
    loop: false,
    playsInline: false,
    src: "",
    currentTime: -1,
    onloadeddata: null as null | (() => void),
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    load: vi.fn(),
  }
}

describe("runSlidePreviewEffect", () => {
  it("draws once and schedules no loop for a static slide", () => {
    const draw = vi.fn()
    const dispose = runSlidePreviewEffect(staticSlide(), draw, makeRefs())
    expect(draw).toHaveBeenCalledTimes(1)
    expect(rafQueue).toHaveLength(0)
    dispose()
    expect(cancelSpy).toHaveBeenCalled()
  })

  it("runs a self-perpetuating RAF loop for an animated background", () => {
    const draw = vi.fn()
    const refs = makeRefs()
    runSlidePreviewEffect(animatedSlide(), draw, refs)
    expect(draw).toHaveBeenCalledTimes(1) // initial draw
    expect(rafQueue).toHaveLength(1)
    flushOneFrame()
    expect(draw).toHaveBeenCalledTimes(2) // loop tick redrew
    expect(rafQueue).toHaveLength(1) // and re-scheduled itself
  })

  it("plays a cached video background and loops without re-decoding", () => {
    const draw = vi.fn()
    const cached = fakeVideo()
    const refs = makeRefs()
    refs.videoCache.set("bg.mp4", cached as unknown as HTMLVideoElement)
    runSlidePreviewEffect(videoSlide(), draw, refs)
    expect(cached.currentTime).toBe(0)
    expect(cached.play).toHaveBeenCalled()
    expect(refs.videoRef.current).toBe(cached)
    expect(rafQueue).toHaveLength(1)
  })

  it("creates, caches, and plays an uncached video once it loads", () => {
    const created = fakeVideo()
    const createEl = vi
      .spyOn(document, "createElement")
      .mockReturnValue(created as unknown as HTMLElement)
    try {
      const draw = vi.fn()
      const refs = makeRefs()
      runSlidePreviewEffect(videoSlide("new.mp4"), draw, refs)
      expect(created.src).toBe("new.mp4")
      expect(created.load).toHaveBeenCalled()
      // No playback / loop until the data lands.
      expect(created.play).not.toHaveBeenCalled()
      expect(rafQueue).toHaveLength(0)

      created.onloadeddata?.()
      expect(refs.videoCache.get("new.mp4")).toBe(created)
      expect(created.play).toHaveBeenCalled()
      expect(rafQueue).toHaveLength(1)
    } finally {
      createEl.mockRestore()
    }
  })

  it("preloads background and element images, redrawing when they land", () => {
    const draw = vi.fn()
    runSlidePreviewEffect(imageSlide(), draw, makeRefs())
    const urls = ensureSpy.mock.calls.map((c) => c[0])
    expect(urls).toEqual(["bg.png", "el.png"])
    // The redraw callback handed to ensureSlideImages is the same draw fn.
    expect(ensureSpy.mock.calls[0][1]).toBe(draw)
  })

  it("pauses the previously-playing video when re-run", () => {
    const prev = fakeVideo()
    const refs = makeRefs({
      videoRef: { current: prev as unknown as HTMLVideoElement },
    })
    runSlidePreviewEffect(staticSlide(), vi.fn(), refs)
    expect(prev.pause).toHaveBeenCalled()
  })
})

// --- Cross-surface parity ---------------------------------------------------

describe("slide-frame parity: operator preview vs output compositor", () => {
  it("draws a static opaque slide with the same renderSlide options both surfaces use", async () => {
    // The operator `SlideCanvas` calls renderSlide with `{ frameTime, hideElements }`
    // (hideElements undefined for the default preview). The output window draws the
    // same slide through the compositor. For a static opaque slide with no entry
    // animation, the compositor must issue renderSlide with a byte-identical opts
    // object — proving preview == live == output. If the compositor ever added
    // extra opts here, the operator preview would silently diverge and this fails.
    const { composeFrame } = await import("@/lib/broadcast-output/compositor")
    const slide = { name: "S", background: { type: "solid" }, elements: [] }
    const noop = () => {}
    const ctx = new Proxy({}, { get: () => noop, set: () => true })

    renderSlideCalls.length = 0
    composeFrame(ctx as unknown as CanvasRenderingContext2D, 1920, 1080, {
      outputMode: "normal",
      stageData: null,
      imageCache: new Map(),
      videoCache: new Map(),
      layerFilter: null,
      clearForeground: false,
      activeMode: "slide",
      latestData: null,
      latestSlide: { slide: slide as unknown as Slide },
      latestMedia: null,
      mediaBlank: false,
      mediaVideo: null,
      mediaFit: { fit: "cover" } as never,
      slideAnimTracker: null,
      baseTheme: null,
      mediaLayer: null,
      mediaLayerImg: null,
      mediaLayerVideo: null,
      props: [],
      alerts: [],
      countdowns: [],
      showLogo: false,
      logoImg: null,
      blackout: false,
      verseAutoFit: false,
      maxVerseScale: 1.5,
      minVerseFontSize: 40,
      frameTime: 1234,
      now: 0,
    })

    // exactly one renderSlide call, with the operator's positional shape + opts.
    expect(renderSlideCalls).toHaveLength(1)
    const [, calledSlide, sw, sh, , , opts] = renderSlideCalls[0]
    expect(calledSlide).toBe(slide)
    expect(sw).toBe(1920)
    expect(sh).toBe(1080)
    // The operator passes { frameTime, now, hideElements: undefined }; the
    // compositor passes { frameTime, now } — identical render (hideElements:
    // undefined is inert). `now` is threaded so clock-mode timer elements tick
    // identically on preview and output.
    expect(opts).toEqual({ frameTime: 1234, now: 0 })
  })
})
