import { beforeEach, describe, expect, it } from "vitest"
import type { ActiveCountdown, CountdownTimer } from "@/types/alert"
import type { Theme } from "@/types/theme"
import { findTimerElement } from "@/lib/theme/model"
import {
  buildCountdownSlide,
  pruneCountdownSlideCache,
  resetCountdownSlideCache,
} from "./countdown-slide"

const theme: Theme = {
  id: "cd",
  name: "cd",
  type: "countdown",
  builtin: false,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { width: 1920, height: 1080 },
  background: { type: "solid", color: "#000" },
  elements: [
    {
      id: "tm",
      type: "timer",
      x: 10,
      y: 40,
      width: 80,
      height: 26,
      mode: "duration",
      durationSeconds: 600,
      format: "mm:ss",
      fontFamily: "Inter",
      fontSize: 140,
      fontWeight: 800,
      italic: false,
      color: "#fff",
      horizontalAlign: "center",
      verticalAlign: "middle",
    },
  ],
}

const timer = (over: Partial<CountdownTimer> = {}): CountdownTimer => ({
  id: "t1",
  label: "Starting in",
  mode: "duration",
  durationSeconds: 60,
  format: "mm:ss",
  styleMode: "theme",
  themeId: "cd",
  backgroundColor: "#000",
  textColor: "#fff",
  fontSize: 96,
  fontFamily: "Inter",
  position: "center",
  showLabel: true,
  endAction: "none",
  ...over,
})

const countdown: ActiveCountdown = {
  id: "c1",
  timerId: "t1",
  mode: "duration",
  startedAt: 1000,
  durationSeconds: 60,
  state: "running",
  accumulatedPausedMs: 0,
}

beforeEach(() => resetCountdownSlideCache())

describe("buildCountdownSlide", () => {
  it("writes the live remaining onto the timer element", () => {
    // remaining = 60 - (11000 - 1000)/1000 = 50s.
    const slide = buildCountdownSlide(timer(), theme, countdown, 11000)
    const t = findTimerElement(slide.elements)!
    expect(t.mode).toBe("duration")
    expect(t.durationSeconds).toBe(50)
  })

  it("synthesises the label heading from the runtime timer label", () => {
    const slide = buildCountdownSlide(
      timer({ label: "Doors open" }),
      theme,
      countdown,
      11000
    )
    const label = slide.elements.find((e) => e.type === "text")
    expect(label).toBeDefined()
    if (label?.type === "text") expect(label.text).toBe("Doors open")
  })

  it("reuses the cached slide across frames, only updating the time", () => {
    const first = buildCountdownSlide(timer(), theme, countdown, 11000)
    const second = buildCountdownSlide(timer(), theme, countdown, 12000)
    // Same structural slide object reused (no per-frame rebuild).
    expect(second).toBe(first)
    // remaining at 12000 = 49s.
    expect(findTimerElement(second.elements)!.durationSeconds).toBe(49)
  })

  it("rebuilds when the theme identity changes", () => {
    const first = buildCountdownSlide(timer(), theme, countdown, 11000)
    const other: Theme = {
      ...theme,
      background: { type: "solid", color: "#111" },
    }
    const second = buildCountdownSlide(timer(), other, countdown, 11000)
    expect(second).not.toBe(first)
  })

  it("prunes cache entries for timers no longer active", () => {
    const first = buildCountdownSlide(timer(), theme, countdown, 11000)
    pruneCountdownSlideCache([]) // t1 no longer active
    const afterPrune = buildCountdownSlide(timer(), theme, countdown, 11000)
    expect(afterPrune).not.toBe(first)
  })
})
