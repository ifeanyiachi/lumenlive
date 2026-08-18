import { describe, expect, it } from "vitest"
import { deriveCountdownVerseTheme, renderCountdownTheme } from "./theme-render"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastTheme } from "@/types/broadcast"

const countdownTheme = BUILTIN_THEMES.find(
  (t) => t.id === "builtin-countdown-midnight"
) as BroadcastTheme

interface Op {
  text: string
  fillStyle: string
  x: number
}

/**
 * Minimal recording 2D context: proportional metrics plus a log of fillText ops
 * so we can assert the countdown renderer paints the digits (and label) with the
 * right colour. Mirrors the helper in `verse-renderer/verse-text.test.ts`.
 */
function recordingCtx(charWidth = 10) {
  const ops: Op[] = []
  const gradient = { addColorStop() {} }
  const ctx: Record<string, unknown> = {
    font: "",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    letterSpacing: "",
    textAlign: "left",
    textBaseline: "top",
    globalAlpha: 1,
    filter: "none",
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
    arc() {},
    arcTo() {},
    ellipse() {},
    closePath() {},
    clip() {},
    rect() {},
    roundRect() {},
    fillRect() {},
    strokeRect() {},
    clearRect() {},
    drawImage() {},
    setLineDash() {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    measureText: (t: string) => ({ width: t.length * charWidth }),
    fillText(text: string, x: number, _y: number) {
      ops.push({ text, fillStyle: ctx.fillStyle as string, x })
    },
    strokeText() {},
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

describe("deriveCountdownVerseTheme", () => {
  it("puts the timer style in the verse slot with the resolved time colour", () => {
    const derived = deriveCountdownVerseTheme(countdownTheme, {
      timeText: "04:59",
      timeColor: "#ff0000",
    })
    expect(derived.verseText.fontSize).toBe(countdownTheme.verseText.fontSize)
    expect(derived.verseText.fontWeight).toBe(
      countdownTheme.verseText.fontWeight
    )
    expect(derived.verseText.color).toBe("#ff0000")
    expect(derived.verseNumbers.visible).toBe(false)
  })

  it("collapses the label region when the label is hidden", () => {
    const hidden = deriveCountdownVerseTheme(countdownTheme, {
      timeText: "04:59",
      timeColor: "#fff",
      showLabel: false,
      label: "Service starts in",
    })
    expect(hidden.reference.fontSize).toBe(0)
    expect(hidden.layout.referenceGap).toBe(0)
  })

  it("keeps the label region when the label is shown", () => {
    const shown = deriveCountdownVerseTheme(countdownTheme, {
      timeText: "04:59",
      timeColor: "#fff",
      showLabel: true,
      label: "Service starts in",
    })
    expect(shown.reference.fontSize).toBe(countdownTheme.reference.fontSize)
    expect(shown.layout.referenceGap).toBe(countdownTheme.layout.referenceGap)
  })

  it("does not mutate the source theme", () => {
    const before = structuredClone(countdownTheme)
    deriveCountdownVerseTheme(countdownTheme, {
      timeText: "01:00",
      timeColor: "#123456",
      showLabel: false,
    })
    expect(countdownTheme).toEqual(before)
  })
})

describe("renderCountdownTheme", () => {
  it("paints the time digits in the resolved colour", () => {
    const { ctx, ops } = recordingCtx()
    renderCountdownTheme(ctx, countdownTheme, {
      timeText: "04:59",
      timeColor: "#ff0000",
      showLabel: false,
    })
    const digitOp = ops.find((o) => o.text.includes("04:59"))
    expect(digitOp).toBeDefined()
    expect(digitOp?.fillStyle).toBe("#ff0000")
  })

  it("paints the label when shown and omits it when hidden", () => {
    const shown = recordingCtx()
    renderCountdownTheme(shown.ctx, countdownTheme, {
      timeText: "04:59",
      timeColor: "#fff",
      showLabel: true,
      label: "STARTING SOON",
    })
    expect(shown.ops.some((o) => o.text.includes("STARTING SOON"))).toBe(true)

    const hidden = recordingCtx()
    renderCountdownTheme(hidden.ctx, countdownTheme, {
      timeText: "04:59",
      timeColor: "#fff",
      showLabel: false,
      label: "STARTING SOON",
    })
    expect(hidden.ops.some((o) => o.text.includes("STARTING SOON"))).toBe(false)
  })

  it("projects the theme onto the output surface instead of authoring size", () => {
    // Without a surface the theme paints at its authored 1920×1080 (centered
    // digits at x≈960). Passing a 2× surface must reproject so the digits stay
    // centered on the real projector — otherwise they pin to the corner at
    // authoring scale (the reported bug).
    const authored = recordingCtx()
    renderCountdownTheme(authored.ctx, countdownTheme, {
      timeText: "04:59",
      timeColor: "#fff",
      showLabel: false,
    })
    const projected = recordingCtx()
    renderCountdownTheme(projected.ctx, countdownTheme, {
      timeText: "04:59",
      timeColor: "#fff",
      showLabel: false,
      surface: { width: 3840, height: 2160 },
    })

    const authoredX = authored.ops.find((o) => o.text.includes("04:59"))?.x
    const projectedX = projected.ops.find((o) => o.text.includes("04:59"))?.x
    expect(authoredX).toBeDefined()
    expect(projectedX).toBeDefined()
    // Centered digits scale with surface width (≈2× here), proving the theme is
    // reprojected rather than drawn at authoring size in the corner.
    expect(projectedX! / authoredX!).toBeCloseTo(2, 1)
  })
})
