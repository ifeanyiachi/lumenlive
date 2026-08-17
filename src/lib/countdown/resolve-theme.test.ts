import { describe, it, expect } from "vitest"
import type { CountdownTimer } from "@/types/alert"
import type { BroadcastTheme } from "@/types/broadcast"
import { resolveTimerTheme } from "./resolve-theme"

const timer = (over: Partial<CountdownTimer> = {}) =>
  ({ id: "t1", styleMode: "theme", themeId: "th1", ...over }) as CountdownTimer

const theme = (over: Partial<BroadcastTheme> = {}) =>
  ({ id: "th1", category: "countdown", ...over }) as BroadcastTheme

describe("resolveTimerTheme", () => {
  it("returns undefined for a custom-mode timer", () => {
    expect(resolveTimerTheme(timer({ styleMode: "custom" }), [theme()])).toBe(
      undefined
    )
  })

  it("returns undefined when the timer names no theme", () => {
    expect(resolveTimerTheme(timer({ themeId: undefined }), [theme()])).toBe(
      undefined
    )
  })

  it("resolves the matching countdown-category theme", () => {
    const th = theme()
    expect(resolveTimerTheme(timer(), [theme({ id: "other" }), th])).toBe(th)
  })

  it("ignores a same-id theme of a different category (scripture theme reused as id)", () => {
    expect(resolveTimerTheme(timer(), [theme({ category: "scripture" })])).toBe(
      undefined
    )
  })

  it("returns undefined when the referenced theme is gone", () => {
    expect(resolveTimerTheme(timer({ themeId: "missing" }), [theme()])).toBe(
      undefined
    )
  })
})
