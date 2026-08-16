import { describe, it, expect } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import { BUILTIN_UNIFIED_THEMES, buildUnifiedRegistry } from "./builtin-themes"

describe("BUILTIN_UNIFIED_THEMES", () => {
  it("includes every built-in verse and slide theme exactly once", () => {
    expect(BUILTIN_UNIFIED_THEMES).toHaveLength(
      BUILTIN_THEMES.length + BUILTIN_SLIDE_THEMES.length
    )
    const ids = BUILTIN_UNIFIED_THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("tags each entry with the correct render kind", () => {
    const verse = BUILTIN_UNIFIED_THEMES.filter((t) => t.kind === "verse")
    const slide = BUILTIN_UNIFIED_THEMES.filter((t) => t.kind === "slide")
    expect(verse).toHaveLength(BUILTIN_THEMES.length)
    expect(slide).toHaveLength(BUILTIN_SLIDE_THEMES.length)
    // Exactly one payload is set per entry.
    for (const t of BUILTIN_UNIFIED_THEMES) {
      expect(Boolean(t.verse) !== Boolean(t.slide)).toBe(true)
    }
  })

  it("surfaces song themes (from the slide catalog) in the unified list", () => {
    const songs = BUILTIN_UNIFIED_THEMES.filter((t) => t.category === "song")
    // The 3 broadcast song themes + the slide/animated song themes all appear.
    expect(songs.length).toBeGreaterThan(3)
    expect(songs.some((t) => t.id === "theme-aurora-worship")).toBe(true)
  })
})

describe("buildUnifiedRegistry", () => {
  it("appends custom broadcast themes after the built-ins", () => {
    const custom = { ...BUILTIN_THEMES[0], id: "custom-1", builtin: false }
    const registry = buildUnifiedRegistry([custom])
    expect(registry).toHaveLength(BUILTIN_UNIFIED_THEMES.length + 1)
    const last = registry[registry.length - 1]
    expect(last.id).toBe("custom-1")
    expect(last.builtin).toBe(false)
    expect(last.kind).toBe("verse")
  })

  it("returns just the built-ins when there are no customs", () => {
    expect(buildUnifiedRegistry([])).toHaveLength(BUILTIN_UNIFIED_THEMES.length)
  })
})
