import { describe, expect, it } from "vitest"
import {
  anchorPosition,
  computeVerseLayoutMetrics,
  __clearLayoutCacheForTests,
} from "./layout"
import { wrapText, wrapTextWithHardBreaks } from "./verse-tokens"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { VerseRenderData } from "@/types/broadcast"

/**
 * Minimal fake 2D context sufficient for the measurement passes: text width is
 * proportional to string length so wrapping/layout math is deterministic.
 */
function fakeCtx(charWidth = 10): CanvasRenderingContext2D {
  const ctx: Record<string, unknown> = {
    font: "",
    letterSpacing: "",
    textAlign: "left",
    textBaseline: "top",
    save() {},
    restore() {},
    measureText: (t: string) => ({ width: t.length * charWidth }),
  }
  return ctx as unknown as CanvasRenderingContext2D
}

const verse: VerseRenderData = {
  reference: "John 3:16",
  segments: [{ text: "For God so loved the world", verseNumber: 16 }],
}

describe("breakPerVerse layout", () => {
  it("makes the verse block taller by forcing each verse onto its own line", () => {
    __clearLayoutCacheForTests()
    const twoVerse: VerseRenderData = {
      reference: "John 3:16-17",
      segments: [
        { verseNumber: 16, text: "For God" },
        { verseNumber: 17, text: "God sent" },
      ],
    }
    const heightWith = (brk: boolean) => {
      const t = structuredClone(BUILTIN_THEMES[0])
      t.layout.breakPerVerse = brk
      return computeVerseLayoutMetrics(fakeCtx(), t, twoVerse).verseRect?.height ?? 0
    }
    // Two short verses share one line when flowing; the break splits them in two.
    expect(heightWith(true)).toBeGreaterThan(heightWith(false))
  })
})

describe("anchorPosition", () => {
  const W = 1920
  const H = 1080
  const aw = 800
  const ah = 400

  it("positions each anchor and applies the offset", () => {
    expect(anchorPosition("top-left", aw, ah, W, H, 0, 0)).toEqual({
      x: 0,
      y: 0,
    })
    expect(anchorPosition("center", aw, ah, W, H, 0, 0)).toEqual({
      x: (W - aw) / 2,
      y: (H - ah) / 2,
    })
    expect(anchorPosition("bottom-right", aw, ah, W, H, 0, 0)).toEqual({
      x: W - aw,
      y: H - ah,
    })
    expect(anchorPosition("top-center", aw, ah, W, H, 5, 7)).toEqual({
      x: (W - aw) / 2 + 5,
      y: 7,
    })
  })
})

describe("wrapText", () => {
  it("keeps text on one line when it fits", () => {
    expect(wrapText(fakeCtx(1), "a b c", 100)).toEqual(["a b c"])
  })

  it("wraps when a line exceeds maxWidth", () => {
    // charWidth 10, maxWidth 35 → about 3 chars per line worth of budget.
    const lines = wrapText(fakeCtx(10), "aa bb cc dd", 35)
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.join(" ")).toBe("aa bb cc dd")
  })

  it("ignores explicit newlines (they stay inside a token)", () => {
    // Documents the plain wrapText behaviour that wrapTextWithHardBreaks fixes.
    expect(wrapText(fakeCtx(1), "line one\nline two", 1000)).toEqual([
      "line one\nline two",
    ])
  })
})

describe("wrapTextWithHardBreaks", () => {
  it("splits on explicit newlines, then word-wraps each hard line", () => {
    expect(
      wrapTextWithHardBreaks(fakeCtx(1), "line one\nline two", 1000)
    ).toEqual(["line one", "line two"])
  })

  it("word-wraps within a hard line while keeping the break", () => {
    // charWidth 10, maxWidth 25 → ~2 chars/line, so each hard line wraps.
    const lines = wrapTextWithHardBreaks(fakeCtx(10), "aa bb\ncc dd", 25)
    // No output line ever spans the hard break "bb"→"cc".
    expect(lines.some((l) => l.includes("bb") && l.includes("cc"))).toBe(false)
    // All four words survive, in order.
    expect(lines.join(" ").split(/\s+/)).toEqual(["aa", "bb", "cc", "dd"])
  })

  it("preserves a blank line for empty segments", () => {
    expect(wrapTextWithHardBreaks(fakeCtx(1), "a\n\nb", 1000)).toEqual([
      "a",
      "",
      "b",
    ])
  })

  it("matches wrapText when there are no newlines", () => {
    const ctx = fakeCtx(10)
    expect(wrapTextWithHardBreaks(ctx, "aa bb cc dd", 35)).toEqual(
      wrapText(ctx, "aa bb cc dd", 35)
    )
  })
})

describe("computeVerseLayoutMetrics", () => {
  const theme = BUILTIN_THEMES[0]

  it("returns the text area and null verse/reference rects when verse is null", () => {
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, null)
    expect(m.textAreaRect.width).toBeGreaterThan(0)
    expect(m.verseRect).toBeNull()
    expect(m.referenceRect).toBeNull()
    expect(m.scaledTheme.resolution).toEqual(theme.resolution) // scale 1 → unchanged
  })

  it("produces verse and reference rects inside the text rect", () => {
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, verse)
    expect(m.verseRect).not.toBeNull()
    expect(m.referenceRect).not.toBeNull()
    for (const rect of [m.verseRect!, m.referenceRect!]) {
      expect(rect.x).toBeGreaterThanOrEqual(m.textRect.x - 0.001)
      expect(rect.width).toBeLessThanOrEqual(m.textRect.width + 0.001)
      expect(Number.isFinite(rect.y)).toBe(true)
    }
  })

  it("scales the theme and canvas by options.scale", () => {
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, verse, { scale: 2 })
    expect(m.scaledTheme.resolution.width).toBe(theme.resolution.width * 2)
    expect(m.scaledTheme.verseText.fontSize).toBe(theme.verseText.fontSize * 2)
  })

  it("memoises identical requests and recomputes when inputs change", () => {
    __clearLayoutCacheForTests()
    const a = computeVerseLayoutMetrics(fakeCtx(), theme, verse)
    const b = computeVerseLayoutMetrics(fakeCtx(), theme, verse)
    expect(b).toBe(a) // same verse/theme/scale/offsets → cache hit, same object

    const scaled = computeVerseLayoutMetrics(fakeCtx(), theme, verse, {
      scale: 2,
    })
    expect(scaled).not.toBe(a) // different scale → recomputed

    const offset = computeVerseLayoutMetrics(fakeCtx(), theme, verse, {
      offsetX: 10,
    })
    expect(offset).not.toBe(a) // different offset → recomputed

    // A different verse object never collides with a cached one.
    const otherVerse: VerseRenderData = {
      reference: "John 3:17",
      segments: [{ text: "different", verseNumber: 17 }],
    }
    const other = computeVerseLayoutMetrics(fakeCtx(), theme, otherVerse)
    expect(other).not.toBe(a)
  })
})

describe("native surface reflow", () => {
  const theme = BUILTIN_THEMES[0]

  it("is byte-identical when the surface equals the authored resolution", () => {
    __clearLayoutCacheForTests()
    const plain = computeVerseLayoutMetrics(fakeCtx(), theme, verse)
    const projected = computeVerseLayoutMetrics(fakeCtx(), theme, verse, {
      surface: { width: theme.resolution.width, height: theme.resolution.height },
    })
    expect(projected.textRect).toEqual(plain.textRect)
    expect(projected.textAreaRect).toEqual(plain.textAreaRect)
    expect(projected.scaledTheme.verseText.fontSize).toBe(
      plain.scaledTheme.verseText.fontSize
    )
  })

  it("widens the text box on a wider-than-authored surface", () => {
    const plain = computeVerseLayoutMetrics(fakeCtx(), theme, verse)
    const wide = computeVerseLayoutMetrics(fakeCtx(), theme, verse, {
      // 2x width, same height (fontScale = min(2,1) = 1, so fonts unchanged).
      surface: {
        width: theme.resolution.width * 2,
        height: theme.resolution.height,
      },
    })
    // The text-area box scales exactly with the surface width; the inner text
    // rect grows too (padding is fixed px, so it doesn't exactly double).
    expect(wide.textAreaRect.width).toBeCloseTo(plain.textAreaRect.width * 2, 3)
    expect(wide.textAreaRect.height).toBeCloseTo(plain.textAreaRect.height, 3)
    expect(wide.textRect.width).toBeGreaterThan(plain.textRect.width)
    expect(wide.scaledTheme.verseText.fontSize).toBe(theme.verseText.fontSize)
  })

  it("scales fonts up uniformly on a larger 16:9 surface", () => {
    const big = computeVerseLayoutMetrics(fakeCtx(), theme, verse, {
      surface: {
        width: theme.resolution.width * 2,
        height: theme.resolution.height * 2,
      },
    })
    expect(big.scaledTheme.verseText.fontSize).toBe(theme.verseText.fontSize * 2)
  })
})

describe("verse auto-fit", () => {
  const theme = BUILTIN_THEMES[0]
  const authored = theme.verseText.fontSize
  const surface = {
    width: theme.resolution.width,
    height: theme.resolution.height,
  }

  it("is off by default — font stays at the authored size", () => {
    __clearLayoutCacheForTests()
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, verse, { surface })
    expect(m.scaledTheme.verseText.fontSize).toBe(authored)
  })

  it("grows a short verse to fill, capped at maxVerseScale", () => {
    const short: VerseRenderData = {
      reference: "John 11:35",
      segments: [{ text: "Jesus wept", verseNumber: 35 }],
    }
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, short, {
      surface,
      verseAutoFit: true,
      maxVerseScale: 1.5,
    })
    const fs = m.scaledTheme.verseText.fontSize
    expect(fs).toBeGreaterThan(authored)
    expect(fs).toBeLessThanOrEqual(Math.round(authored * 1.5))
  })

  it("never exceeds the cap (maxVerseScale = 1 keeps the authored size)", () => {
    const short: VerseRenderData = {
      reference: "John 11:35",
      segments: [{ text: "Jesus wept", verseNumber: 35 }],
    }
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, short, {
      surface,
      verseAutoFit: true,
      maxVerseScale: 1,
    })
    expect(m.scaledTheme.verseText.fontSize).toBeLessThanOrEqual(authored)
  })

  it("shrinks a very long verse below the authored size to fit", () => {
    const long: VerseRenderData = {
      reference: "Psalm 119",
      segments: [
        {
          text: Array.from({ length: 400 }, (_, i) => `word${i}`).join(" "),
          verseNumber: 1,
        },
      ],
    }
    const m = computeVerseLayoutMetrics(fakeCtx(), theme, long, {
      surface,
      verseAutoFit: true,
    })
    expect(m.scaledTheme.verseText.fontSize).toBeLessThan(authored)
  })
})
