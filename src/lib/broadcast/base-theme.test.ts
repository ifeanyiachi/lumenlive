import { describe, expect, it } from "vitest"
import { resolveBaseTheme } from "./base-theme"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { Background } from "@/types/broadcast"

const outputTheme = BUILTIN_THEMES[0]
const otherTheme = BUILTIN_THEMES[1] ?? BUILTIN_THEMES[0]

describe("resolveBaseTheme", () => {
  it("returns the output's own theme when no base is set (default)", () => {
    expect(resolveBaseTheme(null, outputTheme, BUILTIN_THEMES)).toBe(outputTheme)
    expect(resolveBaseTheme(undefined, outputTheme, BUILTIN_THEMES)).toBe(
      outputTheme
    )
  })

  it("returns the named theme for a theme source", () => {
    const resolved = resolveBaseTheme(
      { kind: "theme", themeId: otherTheme.id },
      outputTheme,
      BUILTIN_THEMES
    )
    expect(resolved.id).toBe(otherTheme.id)
  })

  it("falls back to the output theme when the named theme is missing", () => {
    expect(
      resolveBaseTheme(
        { kind: "theme", themeId: "does-not-exist" },
        outputTheme,
        BUILTIN_THEMES
      )
    ).toBe(outputTheme)
  })

  it("synthesizes a background-only theme for a bare background source", () => {
    const background: Background = {
      type: "solid",
      color: "#ff0000",
      gradient: null,
      image: null,
      video: null,
    }
    const resolved = resolveBaseTheme(
      { kind: "background", background },
      outputTheme,
      BUILTIN_THEMES
    )
    // Paints only the chosen background — no branding, no text box.
    expect(resolved.background).toEqual(background)
    expect(resolved.elements).toEqual([])
    expect(resolved.layerOrder).toEqual([])
    expect(resolved.textBox.enabled).toBe(false)
    // Keeps the template's resolution so it reflows to the surface correctly.
    expect(resolved.resolution).toEqual(outputTheme.resolution)
  })
})
