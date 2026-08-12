import { describe, it, expect } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { BUILTIN_SLIDE_THEMES } from "@/types/slide"
import {
  broadcastThemeToUnified,
  slideThemeToUnified,
  toBroadcastTheme,
  toSlideTheme,
} from "./convert"

// The linchpin Phase 1 guarantee: lifting a native theme into the unified
// container and unwrapping it back is byte-identical, so both render engines see
// exactly what they see today. Proven across every built-in.

describe("broadcast (verse) theme round-trip", () => {
  it.each(BUILTIN_THEMES.map((t) => [t.id, t] as const))(
    "%s survives unified round-trip byte-identical",
    (_id, bt) => {
      const u = broadcastThemeToUnified(bt)
      expect(u.kind).toBe("verse")
      expect(u.slide).toBeUndefined()
      expect(toBroadcastTheme(u)).toEqual(bt)
    }
  )

  it("exposes verse identity metadata on the container", () => {
    const bt = BUILTIN_THEMES[0]
    const u = broadcastThemeToUnified(bt)
    expect(u.id).toBe(bt.id)
    expect(u.name).toBe(bt.name)
    expect(u.category).toBe(bt.category)
    expect(u.resolution).toEqual(bt.resolution)
  })

  it("returns null when unwrapping a slide theme as verse", () => {
    const u = slideThemeToUnified(BUILTIN_SLIDE_THEMES[0])
    expect(toBroadcastTheme(u)).toBeNull()
  })
})

describe("slide/song theme round-trip", () => {
  it.each(BUILTIN_SLIDE_THEMES.map((t) => [t.id, t] as const))(
    "%s survives unified round-trip byte-identical",
    (_id, st) => {
      const u = slideThemeToUnified(st)
      expect(u.kind).toBe("slide")
      expect(u.verse).toBeUndefined()
      expect(toSlideTheme(u)).toEqual(st)
    }
  )

  it("song themes surface with the song category on the container", () => {
    const song = BUILTIN_SLIDE_THEMES.find((t) => t.category === "song")!
    const u = slideThemeToUnified(song)
    expect(u.category).toBe("song")
    expect(u.kind).toBe("slide")
  })

  it("returns null when unwrapping a verse theme as slide", () => {
    const u = broadcastThemeToUnified(BUILTIN_THEMES[0])
    expect(toSlideTheme(u)).toBeNull()
  })
})
