import { describe, it, expect } from "vitest"
import {
  DEFAULTABLE_THEME_TYPES,
  isDefaultableThemeType,
  currentDefaultThemeId,
  type ThemeDefaultSettings,
} from "@/lib/theme/defaults"
import type { ThemeType } from "@/types/theme"

const ALL_TYPES: ThemeType[] = [
  "scripture",
  "song",
  "countdown",
  "sermon",
  "overlay",
  "announcement",
]

describe("isDefaultableThemeType", () => {
  it("supports every theme type", () => {
    for (const type of ALL_TYPES) {
      expect(isDefaultableThemeType(type)).toBe(true)
    }
  })

  it("matches the exported DEFAULTABLE_THEME_TYPES list", () => {
    for (const type of ALL_TYPES) {
      expect(isDefaultableThemeType(type)).toBe(
        (DEFAULTABLE_THEME_TYPES as readonly ThemeType[]).includes(type)
      )
    }
  })
})

describe("currentDefaultThemeId", () => {
  const settings: ThemeDefaultSettings = {
    scriptureDefaultThemeId: "custom-scripture-1",
    songSlideDefaults: { themeId: "custom-song-1" },
    otherThemeDefaultIds: {
      countdown: "custom-countdown-1",
      sermon: "custom-sermon-1",
      overlay: "custom-overlay-1",
      announcement: "custom-announcement-1",
    },
  }

  it("reads the scripture default from the top-level field", () => {
    expect(currentDefaultThemeId("scripture", settings)).toBe(
      "custom-scripture-1"
    )
  })

  it("reads the song default from songSlideDefaults", () => {
    expect(currentDefaultThemeId("song", settings)).toBe("custom-song-1")
  })

  it("reads the remaining defaults from their per-type ids", () => {
    for (const type of ["countdown", "sermon", "overlay", "announcement"]) {
      expect(currentDefaultThemeId(type as ThemeType, settings)).toBe(
        `custom-${type}-1`
      )
    }
  })

  it("aliases a stored legacy built-in id to its new-store id", () => {
    // Legacy scripture built-in -> builtin-scripture; legacy named song -> its recreation.
    expect(
      currentDefaultThemeId("scripture", {
        scriptureDefaultThemeId: "builtin-classic-dark",
        songSlideDefaults: { themeId: "theme-aurora-worship" },
        otherThemeDefaultIds: settings.otherThemeDefaultIds,
      })
    ).toBe("builtin-scripture")
    expect(
      currentDefaultThemeId("song", {
        scriptureDefaultThemeId: "builtin-classic-dark",
        songSlideDefaults: { themeId: "theme-aurora-worship" },
        otherThemeDefaultIds: settings.otherThemeDefaultIds,
      })
    ).toBe("builtin-song-aurora")
  })
})
