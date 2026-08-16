import { describe, it, expect } from "vitest"
import {
  slideThemeToEditableSlide,
  editableSlideToSlideTheme,
  createDraftSlideTheme,
} from "./slide-theme-edit"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import type { SlideTheme } from "@/types/slide"

function counter(prefix = "id") {
  let n = 0
  return () => `${prefix}-${n++}`
}

/** The content-only variant (fallback first) — what the editor round-trips. */
function contentVariant(theme: SlideTheme) {
  return (
    theme.variants.find((v) => v.layout === "content-only") ?? theme.variants[0]
  )
}

describe("slide theme ↔ editable slide round-trip", () => {
  it.each(
    BUILTIN_SLIDE_THEMES.filter((t) => t.category === "song").map(
      (t) => [t.id, t] as const
    )
  )(
    "%s: content-only background + elements survive the round-trip",
    (_id, theme) => {
      const slide = slideThemeToEditableSlide(theme, counter())
      const rebuilt = editableSlideToSlideTheme(slide, {
        id: theme.id,
        name: theme.name,
      })
      const src = contentVariant(theme)
      const out = rebuilt.variants.find((v) => v.layout === "content-only")!
      // Background is preserved exactly.
      expect(out.background).toEqual(src.background)
      // Elements match modulo the injected/stripped id (theme elements have none).
      expect(out.elements).toEqual(src.elements)
    }
  )

  it("always emits a content-only + blank pair, custom (non-builtin)", () => {
    const theme = BUILTIN_SLIDE_THEMES.find((t) => t.category === "song")!
    const slide = slideThemeToEditableSlide(theme, counter())
    const rebuilt = editableSlideToSlideTheme(slide, {
      id: "custom-1",
      name: "Mine",
    })
    expect(rebuilt.builtin).toBe(false)
    expect(rebuilt.id).toBe("custom-1")
    expect(rebuilt.name).toBe("Mine")
    expect(rebuilt.variants.map((v) => v.layout)).toEqual([
      "content-only",
      "blank",
    ])
    const blank = rebuilt.variants.find((v) => v.layout === "blank")!
    expect(blank.elements).toEqual([])
    // The blank variant shares the content background but not its object identity.
    const content = rebuilt.variants.find((v) => v.layout === "content-only")!
    expect(blank.background).toEqual(content.background)
    expect(blank.background).not.toBe(content.background)
  })

  it("editing the slide does not mutate the source theme", () => {
    const theme = BUILTIN_SLIDE_THEMES.find(
      (t) => t.category === "song" && contentVariant(t).elements.length
    )!
    const src = structuredClone(theme)
    const slide = slideThemeToEditableSlide(theme, counter())
    const el = slide.elements[0]
    if (el.type === "text") el.text = "EDITED"
    editableSlideToSlideTheme(slide, { id: "c", name: "c" })
    expect(theme).toEqual(src)
  })
})

describe("createDraftSlideTheme", () => {
  it("returns a non-builtin song theme + its editable slide", () => {
    const { theme, slide } = createDraftSlideTheme(
      { id: "new-1", name: "New Theme" },
      counter()
    )
    expect(theme.builtin).toBe(false)
    expect(theme.category).toBe("song")
    expect(theme.id).toBe("new-1")
    expect(slide.elements.length).toBeGreaterThan(0)
    // The draft slide reflects the theme's content-only variant.
    const content = theme.variants.find((v) => v.layout === "content-only")!
    expect(slide.background).toEqual(content.background)
  })
})
