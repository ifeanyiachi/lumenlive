import { describe, it, expect } from "vitest"
import { buildThemePreviewSlide } from "./preview-slide"
import { BUILTIN_SLIDE_THEMES } from "@/types/slide"
import type { SlideTheme } from "@/types/slide"

function counter() {
  let n = 0
  return () => `id-${n++}`
}

describe("buildThemePreviewSlide", () => {
  it("prefers the content-only variant", () => {
    const theme: SlideTheme = {
      id: "t",
      name: "T",
      category: "song",
      builtin: true,
      variants: [
        { layout: "blank", background: { type: "solid", color: "#000" }, elements: [] },
        {
          layout: "content-only",
          background: { type: "solid", color: "#123456" },
          elements: [],
        },
      ],
    }
    const slide = buildThemePreviewSlide(theme, counter())
    expect(slide.background).toEqual({ type: "solid", color: "#123456" })
  })

  it("falls back to the first variant when content-only is absent", () => {
    const theme: SlideTheme = {
      id: "t",
      name: "T",
      category: "song",
      builtin: true,
      variants: [
        { layout: "title", background: { type: "solid", color: "#abcdef" }, elements: [] },
      ],
    }
    const slide = buildThemePreviewSlide(theme, counter())
    expect(slide.background).toEqual({ type: "solid", color: "#abcdef" })
  })

  it("mints ids for elements and deep-clones (no shared structure)", () => {
    const source = BUILTIN_SLIDE_THEMES.find(
      (t) => t.category === "song" && t.variants.some((v) => v.elements.length)
    )!
    const slide = buildThemePreviewSlide(source, counter())
    expect(slide.elements.length).toBeGreaterThan(0)
    expect(slide.elements.every((e) => typeof e.id === "string" && e.id)).toBe(
      true
    )
    // Mutating the preview must not touch the built-in theme.
    const variant =
      source.variants.find((v) => v.layout === "content-only") ??
      source.variants[0]
    const before = structuredClone(variant.elements)
    const el = slide.elements[0]
    if (el.type === "text") el.text = "MUTATED"
    expect(variant.elements).toEqual(before)
  })

  it("produces a valid slide for every built-in slide theme", () => {
    for (const theme of BUILTIN_SLIDE_THEMES) {
      const slide = buildThemePreviewSlide(theme, counter(), 0)
      expect(slide.id).toBeTruthy()
      expect(slide.name).toBe(theme.name)
      expect(slide.background).toBeTruthy()
    }
  })
})
