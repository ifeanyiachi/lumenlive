import { describe, it, expect } from "vitest"
import type { Theme, ThemeType } from "@/types/theme"
import { REQUIRED_PLACEHOLDERS, validateTheme, isValidTheme } from "./validation"
import {
  ANNOUNCEMENT_BUILTIN,
  COUNTDOWN_BUILTIN,
  OVERLAY_BUILTIN,
  SCRIPTURE_BUILTIN,
  SERMON_BUILTIN,
  SONG_BUILTIN,
} from "../builtins"

const EMPTY_BY_TYPE = (type: ThemeType, transparentBg = false): Theme => ({
  id: "t",
  name: "t",
  type,
  builtin: false,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { width: 1920, height: 1080 },
  background: transparentBg
    ? { type: "transparent" }
    : { type: "solid", color: "#000" },
  elements: [],
})

describe("validateTheme — required placeholders", () => {
  it("scripture without a scripture placeholder is invalid", () => {
    const r = validateTheme(EMPTY_BY_TYPE("scripture"))
    expect(r.valid).toBe(false)
    expect(r.errors).toContain(
      "scripture theme must contain a scripture placeholder"
    )
  })

  it("song without a lyrics placeholder is invalid", () => {
    const r = validateTheme(EMPTY_BY_TYPE("song"))
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toMatch(/role "lyrics"/)
  })

  it("sermon reports both missing title and points", () => {
    const r = validateTheme(EMPTY_BY_TYPE("sermon"))
    expect(r.errors).toHaveLength(2)
  })

  it("announcement requires title and body", () => {
    expect(REQUIRED_PLACEHOLDERS.announcement.map((p) => p)).toHaveLength(2)
    expect(validateTheme(EMPTY_BY_TYPE("announcement")).valid).toBe(false)
  })

  it("countdown without a timer placeholder is invalid", () => {
    expect(REQUIRED_PLACEHOLDERS.countdown).toEqual([{ kind: "timer" }])
    const r = validateTheme(EMPTY_BY_TYPE("countdown"))
    expect(r.valid).toBe(false)
    expect(r.errors).toContain("countdown theme must contain a timer placeholder")
    // Adding a timer element satisfies the requirement.
    const withTimer: Theme = {
      ...EMPTY_BY_TYPE("countdown"),
      elements: [
        {
          id: "tmr",
          type: "timer",
          mode: "duration",
          durationSeconds: 300,
          format: "mm:ss",
          x: 10,
          y: 40,
          width: 80,
          height: 20,
          fontFamily: "Inter",
          fontSize: 120,
          fontWeight: 800,
          italic: false,
          color: "#ffffff",
          horizontalAlign: "center",
          verticalAlign: "middle",
        },
      ],
    }
    expect(isValidTheme(withTimer)).toBe(true)
  })
})

describe("validateTheme — overlay transparency", () => {
  it("overlay with a solid background is invalid", () => {
    const r = validateTheme(EMPTY_BY_TYPE("overlay", false))
    expect(r.errors).toContain(
      "overlay theme must have a transparent background"
    )
  })

  it("overlay with a transparent background is valid", () => {
    expect(isValidTheme(EMPTY_BY_TYPE("overlay", true))).toBe(true)
  })
})

describe("built-in themes are all valid", () => {
  it.each([
    ["scripture", SCRIPTURE_BUILTIN],
    ["song", SONG_BUILTIN],
    ["countdown", COUNTDOWN_BUILTIN],
    ["sermon", SERMON_BUILTIN],
    ["overlay", OVERLAY_BUILTIN],
    ["announcement", ANNOUNCEMENT_BUILTIN],
  ] as const)("%s built-in satisfies its type", (_name, theme) => {
    expect(validateTheme(theme)).toEqual({ valid: true, errors: [] })
  })
})
