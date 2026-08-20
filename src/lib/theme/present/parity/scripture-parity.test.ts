import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import {
  diffScriptureParity,
  flattenVerse,
  scriptureElementFromTheme,
} from "./scripture-parity"

/**
 * Scripture parity gate (themeredo.md, Phase 4b → 4c).
 *
 * The verse → slide flip is measured against this suite. Phase 4b closed the
 * content-level gaps (verse numbers, reference format/uppercase, text-transform,
 * styled spans); Phase 4c closed the last one — body-font under **auto-fit** and
 * **surface scaling** — by having the slide path run the identical verse layout
 * (`computeVerseLayoutMetrics`) against the draw surface. So `diffScriptureParity`
 * now reports **no** divergences for the scripture built-ins under every option,
 * auto-fit included. Any divergence firing means the delegation drifted from
 * `renderVerse` — a real regression.
 */

const first = (id: string): BroadcastTheme =>
  BUILTIN_THEMES.find((t) => t.id === id) ?? BUILTIN_THEMES[0]

const CLASSIC = first("builtin-classic-dark")
const WORSHIP = first("builtin-worship-night")

const NUMBERED: VerseRenderData = {
  reference: "John 3:16",
  segments: [
    { verseNumber: 16, text: "For God so loved the world that he gave" },
  ],
}

const MULTI_VERSE: VerseRenderData = {
  reference: "Psalm 1:1-2",
  segments: [
    { verseNumber: 1, text: "Blessed is the one who walks not in the counsel" },
    { verseNumber: 2, text: "but his delight is in the law of the Lord" },
  ],
}

describe("flattenVerse", () => {
  it("joins segments and drops verse numbers / spans (the lossy element-swap)", () => {
    const flat = flattenVerse({
      reference: "Ps 1:1-2",
      segments: [
        { verseNumber: 1, text: "Blessed is the one" },
        { verseNumber: 2, text: "but his delight" },
      ],
    })
    expect(flat.verseText).toBe("Blessed is the one but his delight")
    expect(flat.reference).toBe("Ps 1:1-2")
  })
})

describe("scriptureElementFromTheme", () => {
  it("mirrors the theme's verse typography onto a style-only placeholder", () => {
    const el = scriptureElementFromTheme(CLASSIC)
    expect(el.type).toBe("scripture")
    expect(el.fontSize).toBe(CLASSIC.verseText.fontSize)
    expect(el.color).toBe(CLASSIC.verseText.color)
    expect(el.referenceColor).toBe(CLASSIC.reference.color)
    // Style only — no content baked in.
    expect(el.verseText).toBe("")
    expect(el.reference).toBe("")
  })
})

describe("diffScriptureParity — the Phase 4b parity gate", () => {
  it("reports no divergences for a numbered verse (no auto-fit)", () => {
    const report = diffScriptureParity(CLASSIC, NUMBERED)
    // The slide path delegates to the verse draw passes: verse number, reference
    // label, and body text all reproduce byte-for-byte.
    expect(report.divergences).toEqual([])
    // And the number really is emitted as a token by both paths (not merely
    // absent-vs-absent) — the foothold the check guards.
    expect(report.verse.texts).toContain("16")
    expect(report.slide.texts).toContain("16")
  })

  it("reproduces an uppercase theme's text-transform on the slide path", () => {
    const report = diffScriptureParity(WORSHIP, NUMBERED)
    expect(report.divergences).toEqual([])
    // Body text agrees exactly, transform included.
    expect(report.slide.bodyText).toBe(report.verse.bodyText)
  })

  it("holds parity under auto-fit too — body font matches (Phase 4c)", () => {
    const opts = {
      surface: { width: 1920, height: 1080 },
      verseAutoFit: true,
      maxVerseScale: 1.5,
      minVerseFontSize: 40,
    }
    const report = diffScriptureParity(CLASSIC, NUMBERED, opts)
    // The slide path now runs the same verse layout, so auto-fit agrees exactly.
    expect(report.divergences).toEqual([])
    expect(report.slide.bodyFontPx).toBe(report.verse.bodyFontPx)
    // And auto-fit was genuinely exercised: the short verse grew past its authored
    // size (up to maxVerseScale), so both paths agreeing is a real fit, not a no-op.
    const authored = diffScriptureParity(CLASSIC, NUMBERED)
    expect(report.slide.bodyFontPx ?? 0).toBeGreaterThan(
      authored.slide.bodyFontPx ?? 0
    )
  })

  it("holds parity across all scripture-capable built-ins (no auto-fit)", () => {
    for (const bt of BUILTIN_THEMES) {
      const report = diffScriptureParity(bt, NUMBERED)
      expect(report.themeId).toBe(bt.id)
      expect(report.verse.texts.length).toBeGreaterThan(0)
      expect(report.slide.texts.length).toBeGreaterThan(0)
      // The gate: every built-in reproduces byte-for-byte without auto-fit.
      expect(report.divergences).toEqual([])
    }
  })

  it("holds parity for a multi-verse passage across all built-ins", () => {
    // Two numbered segments drive the token path (per-verse numbers, optional
    // per-verse breaks) — the slide path must reproduce it just the same.
    for (const bt of BUILTIN_THEMES) {
      const report = diffScriptureParity(bt, MULTI_VERSE)
      expect(report.divergences).toEqual([])
    }
  })
})
