import { describe, it, expect } from "vitest"
import type { Theme } from "@/types/theme"
import { BUILTIN_THEMES } from "../builtins"
import { themeToSlide } from "./theme-to-slide"
import { slideToTheme, type ThemeIdentity } from "./slide-to-theme"

const identityOf = (theme: Theme): ThemeIdentity => ({
  id: theme.id,
  type: theme.type,
  name: theme.name,
  pinned: theme.pinned,
  createdAt: theme.createdAt,
  resolution: theme.resolution,
})

describe("slideToTheme", () => {
  it("round-trips a theme's look through the slide editor unchanged", () => {
    for (const theme of BUILTIN_THEMES) {
      // Project to an editable slide, then straight back with no edits.
      const slide = themeToSlide(theme, () => "slide-id", 5)
      const back = slideToTheme(slide, identityOf(theme), 99)
      // The look survives; identity is preserved; the saved copy is never builtin.
      expect(back.background).toEqual(theme.background)
      expect(back.elements).toEqual(theme.elements)
      expect(back.transition).toEqual(theme.transition)
      expect(back.id).toBe(theme.id)
      expect(back.type).toBe(theme.type)
      expect(back.name).toBe(theme.name)
      expect(back.createdAt).toBe(theme.createdAt)
      expect(back.updatedAt).toBe(99)
      expect(back.builtin).toBe(false)
    }
  })

  it("takes the edited slide's background/elements, not the identity's", () => {
    const theme = BUILTIN_THEMES[0]
    const slide = themeToSlide(theme, () => "slide-id")
    slide.background = { type: "solid", color: "#123456" }
    const back = slideToTheme(slide, identityOf(theme), 1)
    expect(back.background).toEqual({ type: "solid", color: "#123456" })
  })

  it("deep-clones so the saved theme never aliases the editor draft", () => {
    const theme = BUILTIN_THEMES[0]
    const slide = themeToSlide(theme, () => "slide-id")
    const back = slideToTheme(slide, identityOf(theme), 1)
    expect(back.elements).not.toBe(slide.elements)
    expect(back.elements[0]).not.toBe(slide.elements[0])
    expect(back.background).not.toBe(slide.background)
  })
})
