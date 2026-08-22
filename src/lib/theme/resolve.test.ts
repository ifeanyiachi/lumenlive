import { describe, expect, it } from "vitest"
import type { CountdownTimer } from "@/types/alert"
import type { Theme } from "@/types/theme"
import {
  resolveCountdownTheme,
  resolveScriptureTheme,
  resolveBaseTheme,
} from "./resolve"

const countdownTheme = (id: string): Theme => ({
  id,
  name: id,
  type: "countdown",
  builtin: false,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { width: 1920, height: 1080 },
  background: { type: "solid", color: "#000" },
  elements: [
    {
      id: "t",
      type: "timer",
      x: 10,
      y: 40,
      width: 80,
      height: 30,
      mode: "duration",
      durationSeconds: 600,
      format: "mm:ss",
      fontFamily: "Inter",
      fontSize: 120,
      fontWeight: 800,
      italic: false,
      color: "#fff",
      horizontalAlign: "center",
      verticalAlign: "middle",
    },
  ],
})

const timer = (over: Partial<CountdownTimer> = {}): CountdownTimer => ({
  id: "timer-1",
  label: "Starting in",
  mode: "duration",
  durationSeconds: 600,
  format: "mm:ss",
  styleMode: "theme",
  themeId: "custom-cd",
  backgroundColor: "#000",
  textColor: "#fff",
  fontSize: 96,
  fontFamily: "Inter",
  position: "center",
  showLabel: true,
  endAction: "none",
  ...over,
})

describe("resolveCountdownTheme", () => {
  const themes = [countdownTheme("custom-cd")]

  it("resolves a countdown theme by its (preserved) id", () => {
    expect(resolveCountdownTheme(timer(), themes)?.id).toBe("custom-cd")
  })

  it("resolves a legacy built-in reference through the alias", () => {
    const pool = [countdownTheme("builtin-countdown")]
    expect(
      resolveCountdownTheme(
        timer({ themeId: "builtin-countdown-midnight" }),
        pool
      )?.id
    ).toBe("builtin-countdown")
  })

  it("returns undefined for a custom-styled timer", () => {
    expect(
      resolveCountdownTheme(timer({ styleMode: "custom" }), themes)
    ).toBeUndefined()
  })

  it("returns undefined for a dangling or missing themeId", () => {
    expect(
      resolveCountdownTheme(timer({ themeId: "gone" }), themes)
    ).toBeUndefined()
    expect(
      resolveCountdownTheme(timer({ themeId: undefined }), themes)
    ).toBeUndefined()
  })

  it("does not resolve a non-countdown theme of the same id", () => {
    const songThemed: Theme[] = [
      { ...countdownTheme("custom-cd"), type: "song" },
    ]
    expect(resolveCountdownTheme(timer(), songThemed)).toBeUndefined()
  })
})

const scriptureTheme = (id: string): Theme => ({
  ...countdownTheme(id),
  type: "scripture",
})

describe("resolveScriptureTheme", () => {
  const themes = [scriptureTheme("custom-scr")]

  it("resolves a scripture theme by its (preserved) id", () => {
    expect(resolveScriptureTheme("custom-scr", themes)?.id).toBe("custom-scr")
  })

  it("resolves a legacy built-in reference through the alias", () => {
    const pool = [scriptureTheme("builtin-scripture")]
    expect(resolveScriptureTheme("builtin-classic-dark", pool)?.id).toBe(
      "builtin-scripture"
    )
  })

  it("returns undefined for a missing/undefined id or a wrong-type theme", () => {
    expect(resolveScriptureTheme("gone", themes)).toBeUndefined()
    expect(resolveScriptureTheme(undefined, themes)).toBeUndefined()
    const song: Theme[] = [{ ...scriptureTheme("custom-scr"), type: "song" }]
    expect(resolveScriptureTheme("custom-scr", song)).toBeUndefined()
  })
})

describe("resolveBaseTheme (new-model / RF3a)", () => {
  const output = scriptureTheme("output-theme")
  const other = { ...scriptureTheme("other-theme"), type: "overlay" as const }
  const themes = [output, other]

  it("null → the output's own theme", () => {
    expect(resolveBaseTheme(null, output, themes)).toBe(output)
  })

  it("kind:theme → the referenced theme (any type), via the alias", () => {
    expect(
      resolveBaseTheme(
        { kind: "theme", themeId: "other-theme" },
        output,
        themes
      ).id
    ).toBe("other-theme")
    // A legacy built-in id aliases to its new built-in.
    const pool = [output, scriptureTheme("builtin-scripture")]
    expect(
      resolveBaseTheme(
        { kind: "theme", themeId: "builtin-classic-dark" },
        output,
        pool
      ).id
    ).toBe("builtin-scripture")
  })

  it("kind:theme with a dangling id → falls back to the output theme", () => {
    expect(
      resolveBaseTheme({ kind: "theme", themeId: "gone" }, output, themes)
    ).toBe(output)
  })

  it("kind:background → a background-only theme with a distinct id and no elements", () => {
    const bg = {
      type: "solid" as const,
      color: "#123456",
      gradient: null,
      image: null,
      video: null,
    }
    const result = resolveBaseTheme(
      { kind: "background", background: bg },
      output,
      themes
    )
    expect(result.id).toBe("base-background")
    expect(result.elements).toEqual([])
    expect(result.background.type).toBe("solid")
  })
})
