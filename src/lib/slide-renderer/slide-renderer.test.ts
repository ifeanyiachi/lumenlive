import { describe, expect, it } from "vitest"
import {
  renderSlide,
  drawSlideElements,
  slideHasScrollingText,
  slideHasVideo,
  slideHasVideoBackground,
  slideHasAnimatedBackground,
  sameAnimatedBackground,
  getTextLineCount,
  getTextWordCount,
} from "./index"
import {
  createDefaultSlide,
  createDefaultTextElement,
  createDefaultVideoElement,
} from "@/types/slide"
import type { Slide, SlideTextElement } from "@/types/slide"

/**
 * Recording fake 2D context: every method is a no-op that records its name;
 * `measureText` returns a length-proportional width; gradient factories return a
 * stub with `addColorStop`. Enough to exercise the render pipeline deterministically.
 */
function recordingCtx() {
  const calls: string[] = []
  const gradient = { addColorStop() {} }
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "measureText")
        return (t: string) => ({ width: t.length * 10 })
      if (prop === "createLinearGradient" || prop === "createRadialGradient")
        return () => gradient
      if (prop === "canvas") return { width: 1920, height: 1080 }
      return (...args: unknown[]) => {
        void args
        calls.push(prop)
      }
    },
    set() {
      return true
    },
  }
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

function textElement(
  overrides: Partial<SlideTextElement> = {}
): SlideTextElement {
  return { ...createDefaultTextElement(), ...overrides }
}

function solidSlide(): Slide {
  const slide = createDefaultSlide()
  slide.background = { type: "solid", color: "#101010" } as Slide["background"]
  slide.elements = [textElement({ text: "Hello world" })]
  return slide
}

describe("slide predicates", () => {
  it("slideHasVideoBackground detects a video background with a url", () => {
    const slide = createDefaultSlide()
    slide.background = {
      type: "video",
      videoUrl: "clip.mp4",
    } as Slide["background"]
    expect(slideHasVideoBackground(slide)).toBe(true)
    expect(slideHasVideoBackground(solidSlide())).toBe(false)
  })

  it("slideHasVideo detects video backgrounds and video elements", () => {
    const withVideoEl = createDefaultSlide()
    withVideoEl.elements = [
      { ...createDefaultVideoElement(), videoUrl: "e.mp4" },
    ]
    expect(slideHasVideo(withVideoEl)).toBe(true)
    expect(slideHasVideo(solidSlide())).toBe(false)
  })

  it("slideHasScrollingText detects a scrolling text element", () => {
    const scrolling = createDefaultSlide()
    scrolling.elements = [
      textElement({ scrolling: { speed: 40, direction: "up" } }),
    ]
    expect(slideHasScrollingText(scrolling)).toBe(true)
    expect(slideHasScrollingText(solidSlide())).toBe(false)
  })

  it("slideHasAnimatedBackground detects an animated background", () => {
    const animated = createDefaultSlide()
    animated.background = {
      type: "animated",
      animated: {
        preset: "aurora",
        palette: ["#7c3aed", "#2563eb"],
        speed: 1,
        intensity: 0.6,
      },
    } as Slide["background"]
    expect(slideHasAnimatedBackground(animated)).toBe(true)
    expect(slideHasAnimatedBackground(solidSlide())).toBe(false)
    // type set but no spec → not animated
    const bare = createDefaultSlide()
    bare.background = { type: "animated" } as Slide["background"]
    expect(slideHasAnimatedBackground(bare)).toBe(false)
  })
})

describe("text measurement", () => {
  it("getTextWordCount counts whitespace-separated words", () => {
    expect(getTextWordCount(textElement({ text: "one two  three" }))).toBe(3)
    expect(getTextWordCount(textElement({ text: "   " }))).toBe(0)
  })

  it("getTextLineCount returns at least one line", () => {
    const { ctx } = recordingCtx()
    const count = getTextLineCount(
      ctx,
      textElement({ text: "a short line" }),
      1920,
      1080
    )
    expect(count).toBeGreaterThanOrEqual(1)
  })
})

describe("renderSlide", () => {
  it("paints the background then the elements without throwing", () => {
    const { ctx, calls } = recordingCtx()
    expect(() => renderSlide(ctx, solidSlide(), 1920, 1080)).not.toThrow()
    // Background solid fill + text fill both go through fillRect / fillText.
    expect(calls).toContain("fillRect")
    expect(calls).toContain("fillText")
  })

  it("skips elements marked not visible", () => {
    const slide = solidSlide()
    slide.elements = [textElement({ text: "hidden", visible: false })]
    const { ctx, calls } = recordingCtx()
    renderSlide(ctx, slide, 1920, 1080)
    // Background still fills, but no text is drawn.
    expect(calls).toContain("fillRect")
    expect(calls).not.toContain("fillText")
  })

  it("renders static backgrounds identically with or without a frame clock", () => {
    // The new frameTime option must not perturb the non-animated draw path.
    const gradientSlide = (): Slide => {
      const s = solidSlide()
      s.background = {
        type: "gradient",
        gradient: {
          type: "linear",
          angle: 180,
          stops: [
            { offset: 0, color: "#111" },
            { offset: 1, color: "#333" },
          ],
        },
      } as Slide["background"]
      return s
    }
    for (const make of [solidSlide, gradientSlide]) {
      const bare = recordingCtx()
      renderSlide(bare.ctx, make(), 1920, 1080)
      const clocked = recordingCtx()
      renderSlide(clocked.ctx, make(), 1920, 1080, undefined, undefined, {
        frameTime: 9999,
      })
      expect(clocked.calls).toEqual(bare.calls)
    }
  })

  it("drawSlideElements paints elements but no background", () => {
    const { ctx, calls } = recordingCtx()
    drawSlideElements(ctx, solidSlide(), 1920, 1080)
    // Text is drawn; the solid background fill is NOT (that's renderSlide's job).
    expect(calls).toContain("fillText")
    expect(calls).not.toContain("fillRect")
  })
})

function animatedBg(
  overrides: Partial<{
    preset: string
    palette: string[]
    speed: number
    intensity: number
    baseColor: string
  }> = {}
): Slide["background"] {
  return {
    type: "animated",
    animated: {
      preset: "aurora",
      palette: ["#111", "#222"],
      speed: 1,
      intensity: 0.6,
      baseColor: "#000",
      ...overrides,
    },
  } as Slide["background"]
}

describe("sameAnimatedBackground", () => {
  it("is true for structurally identical animated specs", () => {
    expect(sameAnimatedBackground(animatedBg(), animatedBg())).toBe(true)
  })

  it("is false when any field differs", () => {
    expect(
      sameAnimatedBackground(animatedBg(), animatedBg({ preset: "bokeh" }))
    ).toBe(false)
    expect(sameAnimatedBackground(animatedBg(), animatedBg({ speed: 2 }))).toBe(
      false
    )
    expect(
      sameAnimatedBackground(
        animatedBg(),
        animatedBg({ palette: ["#111", "#333"] })
      )
    ).toBe(false)
  })

  it("is false when either side is not animated", () => {
    const solid = { type: "solid", color: "#000" } as Slide["background"]
    expect(sameAnimatedBackground(animatedBg(), solid)).toBe(false)
    expect(sameAnimatedBackground(solid, solid)).toBe(false)
  })
})
