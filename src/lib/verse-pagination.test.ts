import { describe, it, expect } from "vitest"
import { paginateVerse } from "./verse-pagination"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { VerseRenderData, VerseSegment } from "@/types/broadcast"

const theme = BUILTIN_THEMES[0]

// measureText proportional to length (font-size-independent), so wrapping is
// deterministic and block height grows with the number of verses.
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

function verse(segments: VerseSegment[]): VerseRenderData {
  return { reference: "John 3:16-20", segments }
}

const longSeg = (n: number): VerseSegment => ({
  verseNumber: n,
  text: `Verse ${n} ${"word ".repeat(40)}`.trim(),
})

describe("paginateVerse", () => {
  it("returns the block unchanged when pagination is disabled", () => {
    const v = verse([longSeg(1), longSeg(2), longSeg(3), longSeg(4), longSeg(5)])
    expect(
      paginateVerse(v, theme, { minFontSize: 40, enabled: false }, fakeCtx())
    ).toEqual([v])
  })

  it("returns a single verse unchanged (nothing to paginate)", () => {
    const v = verse([longSeg(1)])
    expect(
      paginateVerse(v, theme, { minFontSize: 40, enabled: true }, fakeCtx())
    ).toEqual([v])
  })

  it("keeps a short block as one page (fits at the minimum)", () => {
    const v = verse([
      { verseNumber: 16, text: "For God so loved" },
      { verseNumber: 17, text: "the world" },
    ])
    const pages = paginateVerse(
      v,
      theme,
      { minFontSize: 40, enabled: true },
      fakeCtx()
    )
    expect(pages).toHaveLength(1)
    expect(pages[0]).toEqual(v)
  })

  it("splits a long block into multiple pages, preserving verse order", () => {
    const segs = [longSeg(1), longSeg(2), longSeg(3), longSeg(4), longSeg(5)]
    // A large readable floor forces the 5-verse block past the box height.
    const pages = paginateVerse(
      verse(segs),
      theme,
      { minFontSize: 120, enabled: true },
      fakeCtx()
    )
    expect(pages.length).toBeGreaterThan(1)
    // Every original verse appears exactly once, in order, across the pages.
    const flat = pages.flatMap((p) => p.segments)
    expect(flat).toEqual(segs)
    // No page is empty.
    expect(pages.every((p) => p.segments.length > 0)).toBe(true)
  })

  it("splits into more (or equal) pages at a larger minimum font size", () => {
    const segs = [longSeg(1), longSeg(2), longSeg(3), longSeg(4), longSeg(5)]
    const few = paginateVerse(
      verse(segs),
      theme,
      { minFontSize: 80, enabled: true },
      fakeCtx()
    ).length
    const many = paginateVerse(
      verse(segs),
      theme,
      { minFontSize: 160, enabled: true },
      fakeCtx()
    ).length
    expect(many).toBeGreaterThanOrEqual(few)
  })

  it("falls back to one page when no canvas is available", () => {
    const v = verse([longSeg(1), longSeg(2), longSeg(3)])
    // No ctx override, and jsdom's canvas has no 2d context → single page.
    expect(paginateVerse(v, theme, { minFontSize: 40, enabled: true })).toEqual([
      v,
    ])
  })
})
