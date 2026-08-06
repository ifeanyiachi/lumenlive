import { describe, expect, it } from "vitest"
import {
  applyThemeToAllSlides,
  duplicatePresentation,
  exportToJson,
  importFromJson,
  resolveThemeSlideContent,
} from "./presentation-mutations"
import {
  BUILTIN_SLIDE_THEMES,
  createDefaultPresentation,
  createDefaultSlide,
} from "@/types/slide"

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

describe("theme application", () => {
  const theme = BUILTIN_SLIDE_THEMES[0]

  it("resolveThemeSlideContent returns background + fresh element ids", () => {
    const variant = theme.variants[0]
    const content = resolveThemeSlideContent(
      theme.id,
      variant.layout,
      counter("el")
    )!
    expect(content).not.toBeNull()
    expect(content.background).toEqual(variant.background)
    expect(content.elements.map((e) => e.id)).toEqual(
      variant.elements.map((_, i) => `el-${i}`)
    )
  })

  it("resolveThemeSlideContent returns null for an unknown theme", () => {
    expect(resolveThemeSlideContent("nope", "title", counter())).toBeNull()
  })

  it("applyThemeToAllSlides sets each slide's background and stamps updatedAt", () => {
    const p = createDefaultPresentation("Deck")
    p.slides = [createDefaultSlide(), createDefaultSlide()]
    const next = applyThemeToAllSlides(p, theme.id, NOW)!
    expect(next).not.toBeNull()
    expect(next.updatedAt).toBe(NOW)
    for (const slide of next.slides) expect(slide.updatedAt).toBe(NOW)
  })

  it("applyThemeToAllSlides returns null for an unknown theme", () => {
    expect(
      applyThemeToAllSlides(createDefaultPresentation("x"), "nope", NOW)
    ).toBeNull()
  })
})
