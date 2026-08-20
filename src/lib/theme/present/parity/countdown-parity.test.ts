import { describe, expect, it } from "vitest"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastTheme } from "@/types/broadcast"
import {
  countdownSlideFromTheme,
  countdownVerseFacts,
  diffCountdownParity,
  type CountdownPoint,
} from "./countdown-parity"

/**
 * Countdown parity gate (themeredo.md, Phase 4d).
 *
 * The countdown overlay's look moves from the verse path onto a timer-element
 * slide. The geometry legitimately changes, so this gate asserts the content that
 * MUST NOT change — the digit string, the urgency colour, and the label — reproduce
 * byte-for-byte because both paths derive them from the one shared `lib/countdown`
 * math. Any divergence firing means the timer-element representation drifted from
 * the countdown overlay: a regression the live repoint (Phase 5) must not add.
 */

const COUNTDOWN_THEMES: BroadcastTheme[] = BUILTIN_THEMES.filter(
  (t) => t.category === "countdown"
)

const AT_5_MIN: CountdownPoint = {
  remaining: 300,
  format: "mm:ss",
  overtime: false,
  label: "Service starts in",
  showLabel: true,
}

const NEAR_ZERO: CountdownPoint = {
  remaining: 20,
  format: "mm:ss",
  overtime: false,
  label: "Starting soon",
  showLabel: true,
  warnSeconds: 60,
  dangerSeconds: 30,
}

const NO_LABEL: CountdownPoint = {
  remaining: 125,
  format: "mm:ss",
  overtime: false,
  label: "hidden",
  showLabel: false,
}

describe("countdownSlideFromTheme", () => {
  it("carries the theme's verse typography onto the timer placeholder", () => {
    const theme = COUNTDOWN_THEMES[0]
    const slide = countdownSlideFromTheme(theme, AT_5_MIN)
    const timer = slide.elements.find((e) => e.type === "timer")
    expect(timer).toBeDefined()
    if (timer?.type === "timer") {
      expect(timer.fontSize).toBe(theme.verseText.fontSize)
      expect(timer.color).toBe(theme.verseText.color)
      // Pinned to the point's remaining so its own display math matches the frame.
      expect(timer.durationSeconds).toBe(AT_5_MIN.remaining)
    }
  })

  it("adds a label element only when the label shows", () => {
    const theme = COUNTDOWN_THEMES[0]
    expect(
      countdownSlideFromTheme(theme, AT_5_MIN).elements.some(
        (e) => e.type === "text"
      )
    ).toBe(true)
    expect(
      countdownSlideFromTheme(theme, NO_LABEL).elements.some(
        (e) => e.type === "text"
      )
    ).toBe(false)
  })
})

describe("diffCountdownParity — the Phase 4d gate", () => {
  it("digits agree exactly across all countdown built-ins", () => {
    for (const theme of COUNTDOWN_THEMES) {
      const report = diffCountdownParity(theme, AT_5_MIN)
      expect(report.themeId).toBe(theme.id)
      // The gate: same digits, colour, and label — no divergences.
      expect(report.divergences).toEqual([])
      // The time really was drawn as a token by both paths (a foothold, not
      // absent-vs-absent): "05:00" for five minutes in mm:ss.
      expect(report.verse.timeText).toBe("05:00")
      expect(report.slide.timeText).toBe("05:00")
    }
  })

  it("urgency recolouring agrees under warn/danger thresholds", () => {
    for (const theme of COUNTDOWN_THEMES) {
      const report = diffCountdownParity(theme, NEAR_ZERO)
      expect(report.divergences).toEqual([])
      // 20s left is at/under the 30s danger threshold, so the digits recolour off
      // the theme's base colour identically on both paths (not the base colour).
      expect(report.slide.timeColor).toBe(report.verse.timeColor)
    }
  })

  it("hides the label consistently on both paths", () => {
    for (const theme of COUNTDOWN_THEMES) {
      const report = diffCountdownParity(theme, NO_LABEL)
      expect(report.divergences).toEqual([])
      expect(report.verse.labelText).toBeNull()
      expect(report.slide.labelText).toBeNull()
    }
  })

  it("reproduces the label text (casing included) when shown", () => {
    const theme = COUNTDOWN_THEMES[0]
    const report = diffCountdownParity(theme, AT_5_MIN)
    // These themes uppercase the reference slot; the slide path mirrors it, so
    // both draw the same cased label.
    const expected = theme.reference.uppercase
      ? "SERVICE STARTS IN"
      : "Service starts in"
    expect(report.verse.labelText).toBe(expected)
    expect(report.slide.labelText).toBe(expected)
  })

  it("formats hh:mm:ss the same on both paths", () => {
    const theme = COUNTDOWN_THEMES[0]
    const point: CountdownPoint = {
      remaining: 3661,
      format: "hh:mm:ss",
      overtime: false,
      label: "",
      showLabel: false,
    }
    const report = diffCountdownParity(theme, point)
    expect(report.divergences).toEqual([])
    expect(report.slide.timeText).toBe("01:01:01")
  })

  it("verse path really drew the digits (harness sanity)", () => {
    const facts = countdownVerseFacts(COUNTDOWN_THEMES[0], AT_5_MIN)
    expect(facts.texts).toContain("05:00")
  })
})
