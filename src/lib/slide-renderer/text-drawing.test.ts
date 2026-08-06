import { beforeEach, describe, expect, it } from "vitest"
import { __textDrawingTesting, drawTextElement } from "./text-drawing"
import { wrapText } from "@/lib/verse-renderer"
import { createDefaultTextElement } from "@/types/slide"
import type { SlideTextElement } from "@/types/slide"

const { autoShrinkFontSize, clearShrinkCache } = __textDrawingTesting

/**
 * Fake 2D context whose `measureText` scales with the current font's px size, so
 * a smaller font genuinely wraps into fewer lines (unlike a size-agnostic stub).
 * This exercises the real monotonic-fit assumption the binary search relies on.
 */
function fontAwareCtx() {
  let px = 16
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "measureText") {
        return (t: string) => ({ width: t.length * px * 0.6 })
      }
      if (prop === "font") return `${px}px sans-serif`
      return () => {}
    },
    set(_t, prop: string, value: unknown) {
      if (prop === "font") {
        const m = /(\d+(?:\.\d+)?)px/.exec(String(value))
        if (m) px = Number(m[1])
      }
      return true
    },
  }
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D
}

/** The original linear `fs -= 2` scan, kept verbatim as the equivalence oracle. */
function linearShrink(
  ctx: CanvasRenderingContext2D,
  text: string,
  baseFontSize: number,
  lineHeight: number,
  boxWidth: number,
  boxHeight: number
): number {
  let fs = baseFontSize
  const minFs = 8
  while (fs > minFs) {
    ctx.font = `${fs}px sans-serif`
    const lines = wrapText(ctx, text, boxWidth)
    const totalH = lines.length * fs * lineHeight
    if (totalH <= boxHeight) return fs
    fs -= 2
  }
  return minFs
}

describe("autoShrinkFontSize", () => {
  beforeEach(() => clearShrinkCache())

  it("returns byte-identical sizes to the linear scan across a grid of inputs", () => {
    const ctx = fontAwareCtx()
    const texts = [
      "In the beginning God created the heaven and the earth.",
      "short",
      "one two three four five six seven eight nine ten eleven twelve",
      "supercalifragilistic",
    ]
    for (const text of texts) {
      for (let base = 9; base <= 121; base += 1) {
        for (const boxHeight of [40, 100, 240, 600]) {
          const boxWidth = 300
          const lineHeight = 1.2
          clearShrinkCache()
          const got = autoShrinkFontSize(
            ctx,
            text,
            base,
            400,
            "Inter",
            false,
            lineHeight,
            boxWidth,
            boxHeight
          )
          const want = linearShrink(
            ctx,
            text,
            base,
            lineHeight,
            boxWidth,
            boxHeight
          )
          expect(got, `text="${text}" base=${base} boxH=${boxHeight}`).toBe(
            want
          )
        }
      }
    }
  })

  it("never returns below the floor of 8", () => {
    const ctx = fontAwareCtx()
    const fs = autoShrinkFontSize(
      ctx,
      "way too much text ".repeat(50),
      120,
      400,
      "Inter",
      false,
      1.2,
      100,
      10
    )
    expect(fs).toBe(8)
  })

  it("returns the base size when it already fits", () => {
    const ctx = fontAwareCtx()
    const fs = autoShrinkFontSize(
      ctx,
      "hi",
      48,
      400,
      "Inter",
      false,
      1.2,
      1000,
      1000
    )
    expect(fs).toBe(48)
  })

  it("serves a cache hit without touching the context", () => {
    const ctx = fontAwareCtx()
    const first = autoShrinkFontSize(
      ctx,
      "cached text",
      60,
      400,
      "Inter",
      false,
      1.2,
      200,
      120
    )
    // A context that throws on any use — a cache hit must not call it.
    const trap = new Proxy(
      {},
      {
        get() {
          throw new Error("ctx used on cache hit")
        },
        set() {
          throw new Error("ctx used on cache hit")
        },
      }
    ) as unknown as CanvasRenderingContext2D
    const second = autoShrinkFontSize(
      trap,
      "cached text",
      60,
      400,
      "Inter",
      false,
      1.2,
      200,
      120
    )
    expect(second).toBe(first)
  })
})

/** Records fillText calls (and alpha/filter sets) so reveal behavior is testable. */
function fillTextRecorder() {
  const fills: string[] = []
  let alpha = 1
  let filter = "none"
  const alphas: number[] = []
  const filters: string[] = []
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "measureText")
        return (t: string) => ({ width: t.length * 10 })
      if (prop === "globalAlpha") return alpha
      if (prop === "filter") return filter
      if (prop === "fillText")
        return (text: string) => {
          fills.push(text)
          alphas.push(alpha)
          filters.push(filter)
        }
      if (prop === "canvas") return { width: 1920, height: 1080 }
      return () => {}
    },
    set(_t, prop: string, value: unknown) {
      if (prop === "globalAlpha") alpha = value as number
      if (prop === "filter") filter = String(value)
      return true
    },
  }
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  return { ctx, fills, alphas, filters }
}

function lyric(overrides: Partial<SlideTextElement> = {}): SlideTextElement {
  return {
    ...createDefaultTextElement(),
    text: "Hello",
    width: 90,
    height: 70,
    ...overrides,
  }
}

describe("text-build reveal styles", () => {
  it('default ("cut") char-slices the in-progress line', () => {
    const { ctx, fills } = fillTextRecorder()
    // progress 0.5 on a single 5-char line → 3 chars revealed.
    drawTextElement(ctx, lyric(), 1920, 1080, 0.5)
    expect(fills).toContain("Hel")
    expect(fills).not.toContain("Hello")
  })

  it('"fade-up" renders the full line at reduced opacity', () => {
    const { ctx, fills, alphas } = fillTextRecorder()
    drawTextElement(
      ctx,
      lyric({
        textBuild: {
          type: "line-by-line",
          duration: 300,
          delay: 0,
          reveal: "fade-up",
        },
      }),
      1920,
      1080,
      0.5
    )
    // Full line drawn (no slicing) and its alpha is ramped below 1.
    const idx = fills.indexOf("Hello")
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(alphas[idx]).toBeGreaterThan(0)
    expect(alphas[idx]).toBeLessThan(1)
  })

  it('"blur-in" applies a blur filter to the in-progress line', () => {
    const { ctx, fills, filters } = fillTextRecorder()
    drawTextElement(
      ctx,
      lyric({
        textBuild: {
          type: "line-by-line",
          duration: 300,
          delay: 0,
          reveal: "blur-in",
        },
      }),
      1920,
      1080,
      0.3
    )
    const idx = fills.indexOf("Hello")
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(filters[idx]).toMatch(/blur\(/)
  })

  it("fully revealed text (no progress) draws opaque, unsliced, unfiltered", () => {
    const { ctx, fills, alphas, filters } = fillTextRecorder()
    drawTextElement(
      ctx,
      lyric({
        textBuild: {
          type: "line-by-line",
          duration: 300,
          delay: 0,
          reveal: "fade-up",
        },
      }),
      1920,
      1080
      // no textBuildProgress → fully shown
    )
    const idx = fills.indexOf("Hello")
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(alphas[idx]).toBe(1)
    expect(filters[idx]).toBe("none")
  })
})
