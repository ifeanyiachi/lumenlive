import { describe, expect, it } from "vitest"
import {
  computeRemainingSeconds,
  computeProgressRemaining,
  formatCountdownTime,
  resolveTargetEpoch,
  resolveTimeColor,
  WARN_COLOR,
  DANGER_COLOR,
} from "./timer"
import type { ActiveCountdown, CountdownFormat } from "@/types/alert"

/** The historical formatter, kept verbatim as the parity reference. */
function legacyFormat(remainingSec: number, format: CountdownFormat): string {
  const secs = Math.max(0, Math.ceil(remainingSec))
  if (format === "minutes") return `${Math.ceil(secs / 60)}`
  if (format === "hh:mm:ss") {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

const baseDuration: ActiveCountdown = {
  id: "c",
  timerId: "t",
  mode: "duration",
  startedAt: 1000,
  durationSeconds: 60,
  state: "running",
  accumulatedPausedMs: 0,
}

describe("formatCountdownTime", () => {
  it("stays byte-identical to the legacy formatter across a grid", () => {
    const formats: CountdownFormat[] = ["mm:ss", "hh:mm:ss", "minutes"]
    const values = [
      -3, -0.5, 0, 0.4, 1, 9, 10, 59, 60, 61, 90, 599, 600, 3599, 3600, 3661,
      7325.7,
    ]
    for (const format of formats) {
      for (const v of values) {
        // Default (allowNegative = false) must match the old behavior exactly.
        expect(formatCountdownTime(v, format)).toBe(legacyFormat(v, format))
      }
    }
  })

  it("renders overtime with a leading minus when allowNegative", () => {
    expect(formatCountdownTime(-5, "mm:ss", true)).toBe("-00:05")
    expect(formatCountdownTime(-65, "mm:ss", true)).toBe("-01:05")
    expect(formatCountdownTime(-90, "minutes", true)).toBe("-2")
    expect(formatCountdownTime(-3661, "hh:mm:ss", true)).toBe("-01:01:01")
  })

  it("shows 00:00 exactly at zero regardless of sign handling", () => {
    expect(formatCountdownTime(0, "mm:ss", true)).toBe("00:00")
    expect(formatCountdownTime(0, "mm:ss", false)).toBe("00:00")
  })
})

describe("computeRemainingSeconds", () => {
  it("counts down from the start in duration mode", () => {
    // 10s after start of a 60s timer → 50s remaining.
    expect(computeRemainingSeconds(baseDuration, 11000)).toBe(50)
  })

  it("goes negative past expiry (for overtime)", () => {
    expect(computeRemainingSeconds(baseDuration, 65000)).toBe(-4)
  })

  it("freezes while paused and resumes where it left off", () => {
    // Paused 20s in; 30s of wall time then passes while paused.
    const paused: ActiveCountdown = {
      ...baseDuration,
      state: "paused",
      pausedAt: 21000,
    }
    expect(computeRemainingSeconds(paused, 21000)).toBe(40)
    expect(computeRemainingSeconds(paused, 51000)).toBe(40) // frozen

    // After resume, the 30s paused gap is credited back via accumulatedPausedMs.
    const resumed: ActiveCountdown = {
      ...baseDuration,
      state: "running",
      accumulatedPausedMs: 30000,
    }
    // 31s of wall time elapsed, 30s of it paused → 1s of active elapse → 59s.
    expect(computeRemainingSeconds(resumed, 32000)).toBe(59)
  })

  it("counts down to the absolute target in clock mode, ignoring pause", () => {
    const clock: ActiveCountdown = {
      ...baseDuration,
      mode: "clock",
      targetEpochMs: 100000,
      state: "paused",
      pausedAt: 1000,
    }
    expect(computeRemainingSeconds(clock, 40000)).toBe(60)
  })
})

describe("resolveTargetEpoch", () => {
  it("resolves a future time-of-day today", () => {
    const now = new Date(2026, 7, 6, 9, 0, 0, 0).getTime() // 09:00 local
    const target = resolveTargetEpoch("10:00", now)
    expect(target).toBe(new Date(2026, 7, 6, 10, 0, 0, 0).getTime())
  })

  it("rolls a past time-of-day to tomorrow", () => {
    const now = new Date(2026, 7, 6, 11, 0, 0, 0).getTime() // 11:00 local
    const target = resolveTargetEpoch("10:00", now)
    expect(target).toBe(new Date(2026, 7, 7, 10, 0, 0, 0).getTime())
  })

  it("returns null for malformed input", () => {
    const now = new Date(2026, 7, 6, 9, 0, 0, 0).getTime()
    expect(resolveTargetEpoch("nope", now)).toBeNull()
    expect(resolveTargetEpoch("25:00", now)).toBeNull()
    expect(resolveTargetEpoch("10:75", now)).toBeNull()
  })
})

describe("resolveTimeColor", () => {
  const base = { textColor: "#ffffff" }

  it("returns the base color with no thresholds set", () => {
    expect(resolveTimeColor(120, base)).toBe("#ffffff")
    expect(resolveTimeColor(-5, base)).toBe("#ffffff")
  })

  it("crosses to warn then danger as time runs out", () => {
    const timer = { ...base, warnSeconds: 60, dangerSeconds: 10 }
    expect(resolveTimeColor(90, timer)).toBe("#ffffff")
    expect(resolveTimeColor(60, timer)).toBe(WARN_COLOR) // inclusive
    expect(resolveTimeColor(30, timer)).toBe(WARN_COLOR)
    expect(resolveTimeColor(10, timer)).toBe(DANGER_COLOR) // inclusive
    expect(resolveTimeColor(-3, timer)).toBe(DANGER_COLOR) // overtime
  })

  it("supports a warn threshold without a danger threshold", () => {
    const timer = { ...base, warnSeconds: 30 }
    expect(resolveTimeColor(31, timer)).toBe("#ffffff")
    expect(resolveTimeColor(30, timer)).toBe(WARN_COLOR)
  })
})

describe("computeProgressRemaining", () => {
  it("goes 1 → 0 over a duration timer", () => {
    expect(computeProgressRemaining(baseDuration, 1000)).toBe(1) // just started
    expect(computeProgressRemaining(baseDuration, 31000)).toBe(0.5) // 30s in
    expect(computeProgressRemaining(baseDuration, 61000)).toBe(0) // done
    expect(computeProgressRemaining(baseDuration, 90000)).toBe(0) // overtime clamps
  })

  it("uses the start→target span in clock mode", () => {
    const clock: ActiveCountdown = {
      ...baseDuration,
      mode: "clock",
      startedAt: 1000,
      targetEpochMs: 101000, // 100s span
    }
    expect(computeProgressRemaining(clock, 51000)).toBe(0.5)
  })
})
