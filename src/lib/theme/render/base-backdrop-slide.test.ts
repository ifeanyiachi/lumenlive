import { describe, it, expect } from "vitest"
import type { Theme } from "@/types/theme"
import { SCRIPTURE_BUILTIN } from "../builtins"
import { buildBaseBackdropSlide } from "./base-backdrop-slide"

const themes: Theme[] = [SCRIPTURE_BUILTIN]

describe("buildBaseBackdropSlide", () => {
  it("strips the theme's placeholder scripture text (no John 3:16 leak on Clear/idle)", () => {
    const slide = buildBaseBackdropSlide(
      SCRIPTURE_BUILTIN.id,
      null, // "each its own theme" — the reported bug's setting
      themes,
      () => "preview-base"
    )
    expect(slide).not.toBeNull()
    const scripture = slide!.elements.find((e) => e.type === "scripture")
    expect(scripture).toBeDefined()
    if (scripture?.type === "scripture") {
      expect(scripture.reference).toBe("")
      expect(scripture.verseText).toBe("")
      expect(scripture.translation).toBe("")
      // Styling survives — this is a backdrop, only the sample content is blanked.
      const original = SCRIPTURE_BUILTIN.elements.find(
        (e) => e.type === "scripture"
      )
      if (original?.type === "scripture") {
        expect(scripture.fontSize).toBe(original.fontSize)
      }
    }
  })

  it("keeps the theme's background (backdrop still paints)", () => {
    const slide = buildBaseBackdropSlide(
      SCRIPTURE_BUILTIN.id,
      null,
      themes,
      () => "preview-base"
    )
    expect(slide!.background).toEqual(SCRIPTURE_BUILTIN.background)
  })

  it("falls back to the first scripture theme when themeId is undefined", () => {
    const slide = buildBaseBackdropSlide(
      undefined,
      null,
      themes,
      () => "preview-base"
    )
    expect(slide).not.toBeNull()
    expect(slide!.id).toBe("preview-base")
  })

  it("returns null when no scripture theme resolves (no fallback available)", () => {
    expect(
      buildBaseBackdropSlide("x", null, [], () => "preview-base")
    ).toBeNull()
  })

  it("injects id/now deterministically", () => {
    const slide = buildBaseBackdropSlide(
      SCRIPTURE_BUILTIN.id,
      null,
      themes,
      () => "preview-base",
      99
    )
    expect(slide!.id).toBe("preview-base")
    expect(slide!.createdAt).toBe(99)
  })
})
