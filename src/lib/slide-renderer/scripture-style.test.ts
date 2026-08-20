import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { SlideScriptureElement } from "@/types/slide"
import { broadcastToTheme } from "@/lib/theme/migrate"
import { scriptureElementToVerseStyle } from "./scripture-style"

/**
 * RF1 adapter gate (themeredo.md — the renderer Theme-object flip).
 *
 * The live scripture flip removes the pushed `BroadcastTheme` from the render path, so the
 * verse-render `style` is rebuilt from the new `Theme`'s scripture placeholder. This suite
 * proves the adapter carries the placeholder's typography faithfully and the migrator loses
 * no verse styling onto the placeholder. (The former renderVerse-vs-slide byte-parity gate
 * retired with `renderVerse` — the slide path is now the sole scripture engine.)
 */

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

