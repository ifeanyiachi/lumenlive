import { describe, expect, it } from "vitest"
import type { CountdownTimer } from "@/types/alert"
import type { Theme } from "@/types/theme"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { resolveCountdownTheme } from "./resolve"

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
    const legacy = BUILTIN_THEMES.find((t) => t.category === "countdown")!
    const pool = [countdownTheme("builtin-countdown")]
    expect(
      resolveCountdownTheme(timer({ themeId: legacy.id }), pool)?.id
    ).toBe("builtin-countdown")
  })

  it("returns undefined for a custom-styled timer", () => {
    expect(resolveCountdownTheme(timer({ styleMode: "custom" }), themes)).toBeUndefined()
  })

  it("returns undefined for a dangling or missing themeId", () => {
    expect(resolveCountdownTheme(timer({ themeId: "gone" }), themes)).toBeUndefined()
    expect(resolveCountdownTheme(timer({ themeId: undefined }), themes)).toBeUndefined()
  })

  it("does not resolve a non-countdown theme of the same id", () => {
    const songThemed: Theme[] = [{ ...countdownTheme("custom-cd"), type: "song" }]
    expect(resolveCountdownTheme(timer(), songThemed)).toBeUndefined()
  })
})
