import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { VerseRenderData } from "@/types/broadcast"
import type { SlideScriptureElement } from "@/types/slide"
import { broadcastToTheme } from "@/lib/theme/migrate"
import {
  verseFacts,
  slideScriptureFacts,
  scriptureElementFromTheme,
} from "@/lib/theme/present/parity/scripture-parity"
import { scriptureElementToVerseStyle } from "./scripture-style"

/**
 * RF1 gate (themeredo.md — the renderer Theme-object flip).
 *
 * The live scripture flip removes the pushed `BroadcastTheme` from the render path, so the
 * verse-render `style` must be rebuilt from the new `Theme`'s scripture placeholder. This
 * suite proves the enrich → migrate → adapt round-trip is **feature-preserving** (the
 * reframed correctness bar): a built-in verse theme, migrated to the placeholder and read
 * back through {@link scriptureElementToVerseStyle}, still renders the same verse body,
 * verse numbers, reference (format/uppercase), and per-verse breaks. It is deliberately
 * NOT pixel-parity — the placeholder is leaner (e.g. no separate reference font) and the
 * geometry is expressed differently — so we compare content facts, not coordinates.
 */

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

/** The scripture placeholder a built-in migrates to (only scripture-typed themes). */
function scripturePlaceholderOf(themeIndex: number): SlideScriptureElement | null {
  const migrated = broadcastToTheme(BUILTIN_THEMES[themeIndex])
  if (migrated.type !== "scripture") return null
  const el = migrated.elements.find((e) => e.type === "scripture")
  return (el as SlideScriptureElement) ?? null
}

describe("scriptureElementToVerseStyle", () => {
  it("builds a valid verse-style carrying the element's typography", () => {
    const el: SlideScriptureElement = {
      id: "s",
      type: "scripture",
      x: 10,
      y: 20,
      width: 80,
      height: 60,
      reference: "",
      verseText: "",
      translation: "",
      fontFamily: "Georgia",
      fontSize: 64,
      fontWeight: 700,
      bold: true,
      italic: true,
      color: "#eeeeee",
      horizontalAlign: "center",
      verticalAlign: "middle",
      lineHeight: 1.3,
      referenceFontSize: 32,
      referenceColor: "#cccccc",
      verseNumbers: { visible: true, fontSize: 24, color: "#ffcc00", superscript: true },
      referenceUppercase: true,
      referencePosition: "above",
      breakPerVerse: true,
      textTransform: "uppercase",
      letterSpacing: 2,
    }
    const style = scriptureElementToVerseStyle(el)
    expect(style.verseText.fontFamily).toBe("Georgia")
    expect(style.verseText.fontSize).toBe(64)
    expect(style.verseText.fontStyle).toBe("italic")
    expect(style.verseText.textTransform).toBe("uppercase")
    expect(style.verseText.letterSpacing).toBe(2)
    expect(style.verseNumbers).toEqual(el.verseNumbers)
    expect(style.reference.uppercase).toBe(true)
    expect(style.reference.position).toBe("above")
    expect(style.reference.fontSize).toBe(32)
    expect(style.layout.breakPerVerse).toBe(true)
    // The element box becomes the verse text area at the reference resolution.
    expect(style.layout.textAreaWidth).toBe(80)
    expect(style.layout.textAreaHeight).toBe(60)
    expect(style.layout.offsetX).toBeCloseTo((10 / 100) * 1920)
    expect(style.layout.offsetY).toBeCloseTo((20 / 100) * 1080)
  })

  it("falls back to sane defaults when the element omits verse styling", () => {
    const bare: SlideScriptureElement = {
      id: "s",
      type: "scripture",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      reference: "",
      verseText: "",
      translation: "",
      fontFamily: "Inter",
      fontSize: 48,
      fontWeight: 400,
      bold: false,
      italic: false,
      color: "#ffffff",
      horizontalAlign: "left",
      verticalAlign: "top",
      lineHeight: 1.2,
      referenceFontSize: 24,
      referenceColor: "#dddddd",
    }
    const style = scriptureElementToVerseStyle(bare)
    expect(style.verseNumbers.visible).toBe(false)
    expect(style.reference.uppercase).toBe(false)
    expect(style.reference.position).toBe("below")
    expect(style.layout.breakPerVerse).toBe(false)
    expect(style.verseText.textTransform).toBe("none")
    expect(style.textBox.enabled).toBe(false)
  })
})

describe("broadcastToTheme carries verse styling onto the placeholder (RF1 no-loss)", () => {
  it("preserves verse numbers, reference format, and per-verse breaks", () => {
    for (let i = 0; i < BUILTIN_THEMES.length; i++) {
      const bt = BUILTIN_THEMES[i]
      const el = scripturePlaceholderOf(i)
      if (!el) continue
      expect(el.verseNumbers).toEqual(bt.verseNumbers)
      expect(el.referenceUppercase).toBe(bt.reference.uppercase)
      expect(el.referencePosition).toBe(bt.reference.position)
      expect(el.breakPerVerse).toBe(bt.layout.breakPerVerse ?? false)
      expect(el.letterSpacing).toBe(bt.verseText.letterSpacing)
    }
  })
})

describe("enrich → migrate → adapt round-trip is feature-preserving", () => {
  const cases: [string, VerseRenderData][] = [
    ["numbered", NUMBERED],
    ["multi-verse", MULTI_VERSE],
  ]

  for (const [label, verse] of cases) {
    it(`reproduces verse body, numbers, and reference for ${label}`, () => {
      for (let i = 0; i < BUILTIN_THEMES.length; i++) {
        const bt = BUILTIN_THEMES[i]
        const el = scripturePlaceholderOf(i)
        if (!el) continue
        const style = scriptureElementToVerseStyle(el)

        // Original: the source theme through `renderVerse`. Rebuilt: the reconstructed
        // VerseStyle through the slide payload path (its only consumer now that VR1
        // narrowed the payload off `BroadcastTheme`) — a style-only carrier element with
        // the verse riding the payload.
        const original = verseFacts(bt, verse)
        const rebuilt = slideScriptureFacts(
          scriptureElementFromTheme(bt),
          { type: "solid", color: "#000000" },
          { verse, style }
        )

        // Body text (transform included) survives the round-trip.
        expect(rebuilt.bodyText, `${bt.id} body`).toBe(original.bodyText)
        // Reference label (uppercase/format) survives.
        expect(rebuilt.referenceText, `${bt.id} ref`).toBe(original.referenceText)
        // Verse numbers: when the theme shows them, both paths emit the token.
        if (bt.verseNumbers.visible) {
          const num = String(verse.segments[0].verseNumber)
          expect(original.texts).toContain(num)
          expect(rebuilt.texts, `${bt.id} verse-number`).toContain(num)
        }
      }
    })
  }
})
