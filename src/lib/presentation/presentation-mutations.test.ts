import { describe, expect, it } from "vitest"
import {
  applyThemeToDeck,
  applyThemeToSlideAt,
  duplicatePresentation,
  exportToJson,
  importFromJson,
} from "./presentation-mutations"
import { SONG_BUILTIN, BUILTIN_THEMES } from "@/lib/theme/builtins"
import type { SlideTextElement } from "@/types/slide"
import type { Theme } from "@/types/theme"
import {
  createDefaultPresentation,
  createDefaultSlide,
} from "@/lib/slide-defaults"

const NOW = 12000

function counter(prefix = "id") {
  let n = 0
  return () => `${prefix}-${n++}`
}

describe("duplicatePresentation", () => {
  it("re-ids the deck, slides, and elements and tags the name", () => {
    const p = createDefaultPresentation("Sermon")
    p.slides = [createDefaultSlide()]
    const dup = duplicatePresentation(p, counter(), NOW)
    expect(dup.name).toBe("Sermon (Copy)")
    expect(dup.id).not.toBe(p.id)
    expect(dup.slides[0].id).not.toBe(p.slides[0].id)
    expect(dup.createdAt).toBe(NOW)
    expect(dup.updatedAt).toBe(NOW)
  })
})

describe("export/import round-trip", () => {
  it("exportToJson emits pretty JSON", () => {
    const p = createDefaultPresentation("X")
    const json = exportToJson(p)
    expect(json).toContain("\n  ") // indented
    expect(JSON.parse(json).id).toBe(p.id)
  })

  it("importFromJson re-ids and tags valid input", () => {
    const p = createDefaultPresentation("Deck")
    p.slides = [createDefaultSlide()]
    const imported = importFromJson(exportToJson(p), counter("imp"), NOW)!
    expect(imported).not.toBeNull()
    expect(imported.name).toBe("Deck (Imported)")
    expect(imported.id).not.toBe(p.id)
    expect(imported.slides[0].id).not.toBe(p.slides[0].id)
  })

  it("importFromJson defaults the name when absent", () => {
    const imported = importFromJson(
      JSON.stringify({ slides: [] }),
      counter(),
      NOW
    )!
    expect(imported.name).toBe("Imported Presentation")
  })

  it("importFromJson returns null for malformed or non-slide JSON", () => {
    expect(importFromJson("not json", counter(), NOW)).toBeNull()
    expect(
      importFromJson(JSON.stringify({ foo: 1 }), counter(), NOW)
    ).toBeNull()
  })
})

describe("theme application (bake-in model, 3C)", () => {
  const theme = SONG_BUILTIN
  // The typography the song built-in bakes onto text (its lyrics placeholder).
  const lyric = SONG_BUILTIN.elements.find(
    (e): e is SlideTextElement => e.type === "text"
  )!

  it("applyThemeToDeck bakes background + typography onto every slide", () => {
    const p = createDefaultPresentation("Deck")
    p.slides = [createDefaultSlide(), createDefaultSlide()]
    const next = applyThemeToDeck(p, theme.id, NOW, BUILTIN_THEMES)!
    expect(next).not.toBeNull()
    expect(next.updatedAt).toBe(NOW)
    for (const slide of next.slides) {
      expect(slide.updatedAt).toBe(NOW)
      expect(slide.background).toEqual(theme.background)
      // Every text element takes the theme's font/color; text + id are preserved.
      for (const el of slide.elements) {
        if (el.type !== "text") continue
        expect(el.fontFamily).toBe(lyric.fontFamily)
        expect(el.fontSize).toBe(lyric.fontSize)
        expect(el.color).toBe(lyric.color)
      }
    }
  })

  it("preserves each text element's own text, position, and id", () => {
    const p = createDefaultPresentation("Deck")
    const slide = createDefaultSlide()
    const original = slide.elements.find(
      (e): e is SlideTextElement => e.type === "text"
    )
    p.slides = [slide]
    const next = applyThemeToDeck(p, theme.id, NOW, BUILTIN_THEMES)!
    const baked = next.slides[0].elements.find(
      (e): e is SlideTextElement => e.type === "text"
    )
    if (original && baked) {
      expect(baked.id).toBe(original.id)
      expect(baked.text).toBe(original.text)
      expect(baked.x).toBe(original.x)
      expect(baked.width).toBe(original.width)
    }
  })

  it("applyThemeToSlideAt bakes onto only the targeted slide", () => {
    const p = createDefaultPresentation("Deck")
    p.slides = [createDefaultSlide(), createDefaultSlide()]
    const before = p.slides[1].background
    const next = applyThemeToSlideAt(p, 0, theme.id, NOW, BUILTIN_THEMES)!
    expect(next.slides[0].background).toEqual(theme.background)
    // The other slide is untouched (same background reference-equal object).
    expect(next.slides[1].background).toBe(before)
  })

  it("returns null for an unknown theme or an out-of-range index", () => {
    const p = createDefaultPresentation("x")
    expect(applyThemeToDeck(p, "nope", NOW, BUILTIN_THEMES)).toBeNull()
    expect(applyThemeToSlideAt(p, 0, "nope", NOW, BUILTIN_THEMES)).toBeNull()
    expect(applyThemeToSlideAt(p, 99, theme.id, NOW, BUILTIN_THEMES)).toBeNull()
  })

  it("resolves a legacy theme id through the alias", () => {
    const p = createDefaultPresentation("Deck")
    p.slides = [createDefaultSlide()]
    // theme-hymnal → builtin-song-hymnal in the alias.
    const next = applyThemeToDeck(p, "theme-hymnal", NOW, BUILTIN_THEMES)
    expect(next).not.toBeNull()
    const hymnal = BUILTIN_THEMES.find((t) => t.id === "builtin-song-hymnal")!
    expect(next!.slides[0].background).toEqual(hymnal.background)
  })

  it("resolves a theme from a custom pool", () => {
    const custom: Theme = {
      ...SONG_BUILTIN,
      id: "custom-x",
      name: "Custom",
      builtin: false,
      background: { type: "solid", color: "#abcabc" },
    }
    const p = createDefaultPresentation("Deck")
    p.slides = [createDefaultSlide()]
    // Unknown to the built-in-only pool…
    expect(applyThemeToDeck(p, "custom-x", NOW, BUILTIN_THEMES)).toBeNull()
    // …but resolvable when included in the pool.
    const next = applyThemeToDeck(p, "custom-x", NOW, [
      ...BUILTIN_THEMES,
      custom,
    ])!
    expect(next.slides[0].background).toEqual({
      type: "solid",
      color: "#abcabc",
    })
  })
})
