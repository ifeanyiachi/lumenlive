import { describe, expect, it } from "vitest"
import { drawVerseText } from "./verse-text"
import { computeVerseLayoutMetrics } from "./layout"
import { CLASSIC_VERSE_STYLE } from "./verse-style.fixture"
import type { VerseRenderData } from "@/types/broadcast"

/**
 * Guards the Phase-1 layout-cache work: the draw pass must produce the exact
 * same output whether it re-wraps internally (fallback) or reuses the wrapping
 * computed during layout (the fast path). And on the fast path the plain draw
 * pass must perform zero `measureText` calls, which is the whole point — a
 * memoised layout can then be redrawn every animation frame for free.
 */

interface Op {
  op: "fillText" | "strokeText"
  text: string
  x: number
  y: number
  font: string
  fillStyle: string
  textAlign: string
}

/**
 * Recording 2D context: proportional text metrics (width = length × charWidth)
 * plus a log of every fill/stroke text op and a count of measureText calls.
 */
function recordingCtx(charWidth = 10) {
  const ops: Op[] = []
  let measureCount = 0
  const ctx: Record<string, unknown> = {
    font: "",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    letterSpacing: "",
    textAlign: "left",
    textBaseline: "top",
    globalAlpha: 1,
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    fill() {},
    arcTo() {},
    closePath() {},
    rect() {},
    measureText(t: string) {
      measureCount++
      return { width: t.length * charWidth }
    },
    fillText(text: string, x: number, y: number) {
      ops.push({
        op: "fillText",
        text,
        x,
        y,
        font: ctx.font as string,
        fillStyle: ctx.fillStyle as string,
        textAlign: ctx.textAlign as string,
      })
    },
    strokeText(text: string, x: number, y: number) {
      ops.push({
        op: "strokeText",
        text,
        x,
        y,
        font: ctx.font as string,
        fillStyle: ctx.fillStyle as string,
        textAlign: ctx.textAlign as string,
      })
    },
  }
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    ops,
    measureCount: () => measureCount,
  }
}

const theme = CLASSIC_VERSE_STYLE

const plainVerse: VerseRenderData = {
  reference: "John 3:16",
  segments: [
    {
      verseNumber: 16,
      text: "For God so loved the world that he gave his only begotten Son that whosoever believeth in him should not perish but have everlasting life",
    },
  ],
}

const styledVerse: VerseRenderData = {
  reference: "John 3:16",
  segments: [
    {
      verseNumber: 16,
      text: "For God so loved the world",
      spans: [
        { start: 8, end: 13, style: { bold: true, highlight: "#ffff00" } },
      ],
    },
  ],
}

const interlinearVerse: VerseRenderData = {
  reference: "John 1:1",
  segments: [
    { text: "In (en) the beginning (arche) was the Word", isInterlinear: true },
  ],
}

/**
 * Draw once letting the fn re-wrap, once passing the layout's wrapping — both at
 * the exact rect the layout measured against (as `index.ts` does), so the only
 * variable under test is whether the wrapping is reused or recomputed.
 */
function drawBoth(verse: VerseRenderData) {
  const layout = computeVerseLayoutMetrics(recordingCtx().ctx, theme, verse)
  const x = layout.textRect.x
  const w = layout.textRect.width
  const y = layout.verseRect?.y ?? 0

  const fallback = recordingCtx()
  drawVerseText(fallback.ctx, theme, verse, x, w, y)

  const reused = recordingCtx()
  drawVerseText(
    reused.ctx,
    theme,
    verse,
    x,
    w,
    y,
    layout.wrappedVerse ?? undefined
  )

  return { fallback, reused }
}

describe("drawVerseText layout reuse parity", () => {
  it("plain: reused wrapping matches fallback exactly", () => {
    const { fallback, reused } = drawBoth(plainVerse)
    expect(reused.ops).toEqual(fallback.ops)
    expect(fallback.ops.length).toBeGreaterThan(0)
  })

  it("styled: reused wrapping matches fallback exactly", () => {
    const { fallback, reused } = drawBoth(styledVerse)
    expect(reused.ops).toEqual(fallback.ops)
    expect(fallback.ops.length).toBeGreaterThan(0)
  })

  it("interlinear: reused wrapping matches fallback exactly", () => {
    const { fallback, reused } = drawBoth(interlinearVerse)
    expect(reused.ops).toEqual(fallback.ops)
    expect(fallback.ops.length).toBeGreaterThan(0)
  })

  it("interlinear: tokens are drawn left-anchored under a centered theme (no re-centering overlap)", () => {
    // Regression: the body theme sets ctx.textAlign to "center", but the
    // interlinear path positions each token itself via a cursor (a left edge).
    // If the canvas is left in "center" mode it re-anchors every token on its
    // cursor, overlapping them. Every interlinear token must be drawn "left".
    const centered = structuredClone(theme)
    centered.verseText.horizontalAlign = "center"

    const layout = computeVerseLayoutMetrics(
      recordingCtx().ctx,
      centered,
      interlinearVerse
    )
    const rec = recordingCtx()
    drawVerseText(
      rec.ctx,
      centered,
      interlinearVerse,
      layout.textRect.x,
      layout.textRect.width,
      layout.verseRect?.y ?? 0,
      layout.wrappedVerse ?? undefined
    )

    expect(rec.ops.length).toBeGreaterThan(0)
    for (const op of rec.ops) {
      expect(op.textAlign).toBe("left")
    }
    // Tokens advance strictly left-to-right within each line (no overlap): x is
    // non-decreasing across ops sharing a baseline y.
    const byLine = new Map<number, number>()
    for (const op of rec.ops) {
      const prev = byLine.get(op.y)
      if (prev !== undefined) expect(op.x).toBeGreaterThanOrEqual(prev)
      byLine.set(op.y, op.x)
    }
  })

  // ── Verse-number styling + per-verse line breaks ──

  function drawWith(t: typeof theme, verse: VerseRenderData) {
    const layout = computeVerseLayoutMetrics(recordingCtx().ctx, t, verse)
    const rec = recordingCtx()
    drawVerseText(
      rec.ctx,
      t,
      verse,
      layout.textRect.x,
      layout.textRect.width,
      layout.verseRect?.y ?? 0,
      layout.wrappedVerse ?? undefined
    )
    return rec
  }

  it("draws the verse number in its own colour and superscript size", () => {
    const t = structuredClone(theme)
    t.verseText.color = "#ffffff"
    t.verseNumbers = {
      visible: true,
      color: "#ff3366",
      superscript: true,
      fontSize: 24,
    }
    t.layout.breakPerVerse = false

    const rec = drawWith(t, plainVerse)
    const num = rec.ops.find(
      (o) => o.op === "fillText" && o.text.trim() === "16"
    )
    expect(num).toBeDefined()
    expect(num!.fillStyle).toBe("#ff3366")
    expect(num!.font).toContain("24px")

    // The body text stays the body colour — the number colour is scoped to it.
    const body = rec.ops.find(
      (o) => o.op === "fillText" && o.text.trim() === "For"
    )
    expect(body!.fillStyle).toBe("#ffffff")
  })

  it("keeps the number inline in the body colour for a neutral theme (plain path)", () => {
    const t = structuredClone(theme)
    t.verseText.color = "#ffffff"
    t.verseNumbers = {
      visible: true,
      color: "#ffffff",
      superscript: false,
      fontSize: 20,
    }
    t.layout.breakPerVerse = false

    const rec = drawWith(t, plainVerse)
    // Plain path draws whole wrapped lines: the first line starts with the number
    // concatenated onto the body text in a single op, not a standalone "16".
    const first = rec.ops.find(
      (o) => o.op === "fillText" && o.text.includes("16")
    )
    expect(first!.text.startsWith("16 For")).toBe(true)
  })

  it("puts each verse on its own line when breakPerVerse is on", () => {
    const twoVerse: VerseRenderData = {
      reference: "John 3:16-17",
      segments: [
        { verseNumber: 16, text: "For God" },
        { verseNumber: 17, text: "God sent" },
      ],
    }
    const lineCount = (brk: boolean) => {
      const t = structuredClone(theme)
      t.layout.breakPerVerse = brk
      const rec = drawWith(t, twoVerse)
      const ys = rec.ops
        .filter((o) => o.op === "fillText" && o.text.trim().length > 0)
        .map((o) => o.y)
      return new Set(ys).size
    }
    // Both verses fit on one line together; the break forces a second line.
    expect(lineCount(false)).toBe(1)
    expect(lineCount(true)).toBe(2)
  })

  it("plain: reusing the layout wrapping performs zero measureText calls in the draw pass", () => {
    const layout = computeVerseLayoutMetrics(
      recordingCtx().ctx,
      theme,
      plainVerse
    )
    const x = layout.textRect.x
    const w = layout.textRect.width
    const y = layout.verseRect?.y ?? 0

    const reused = recordingCtx()
    drawVerseText(
      reused.ctx,
      theme,
      plainVerse,
      x,
      w,
      y,
      layout.wrappedVerse ?? undefined
    )
    expect(reused.measureCount()).toBe(0)

    // The fallback path (no precomputed wrapping) still has to measure.
    const fallback = recordingCtx()
    drawVerseText(fallback.ctx, theme, plainVerse, x, w, y)
    expect(fallback.measureCount()).toBeGreaterThan(0)
  })
})
