import { describe, expect, it } from "vitest"
import {
  gainToPercent,
  percentToGain,
  thresholdToPercent,
  percentToThreshold,
  formatPauseSeconds,
} from "./conversions"
import { groupTranslations, type TranslationInfo } from "./translations"
import {
  makeCommandLogEntry,
  appendCommandLogEntry,
  stripRemotePrefix,
  parsePort,
  MAX_LOG_ENTRIES,
  type CommandLogEntry,
} from "./remote-log"

describe("conversions", () => {
  it("gain 0–2 maps to 0–100% with 50% unity", () => {
    expect(gainToPercent(0)).toBe(0)
    expect(gainToPercent(1.0)).toBe(50)
    expect(gainToPercent(2.0)).toBe(100)
  })

  it("percentToGain is the inverse of gainToPercent at integer percents", () => {
    for (const pct of [0, 25, 50, 75, 100]) {
      expect(gainToPercent(percentToGain(pct))).toBe(pct)
    }
  })

  it("threshold 0–1 maps to 0–100% and back", () => {
    expect(thresholdToPercent(0.35)).toBe(35)
    expect(thresholdToPercent(1)).toBe(100)
    expect(percentToThreshold(80)).toBeCloseTo(0.8)
  })

  it("formats a pause window in ms as a one-decimal seconds label", () => {
    expect(formatPauseSeconds(1400)).toBe("1.4s")
    expect(formatPauseSeconds(500)).toBe("0.5s")
    expect(formatPauseSeconds(3000)).toBe("3.0s")
  })
})

describe("groupTranslations", () => {
  const list: TranslationInfo[] = [
    { id: 1, abbreviation: "KJV", title: "King James", language: "en" },
    { id: 2, abbreviation: "RVR", title: "Reina-Valera", language: "es" },
    { id: 3, abbreviation: "ESV", title: "English Standard", language: "en" },
  ]

  it("splits English from other languages, preserving order", () => {
    const { english, other } = groupTranslations(list)
    expect(english.map((t) => t.id)).toEqual([1, 3])
    expect(other.map((t) => t.id)).toEqual([2])
  })

  it("handles an empty list", () => {
    expect(groupTranslations([])).toEqual({ english: [], other: [] })
  })
})

describe("remote-log", () => {
  it("makeCommandLogEntry passes through injected id/timestamp", () => {
    const entry = makeCommandLogEntry({
      id: 7,
      timestamp: "12:00:00",
      source: "OSC",
      command: "next",
    })
    expect(entry).toEqual({
      id: 7,
      timestamp: "12:00:00",
      source: "OSC",
      command: "next",
    })
  })

  it("appendCommandLogEntry prepends newest-first and caps the list", () => {
    let log: CommandLogEntry[] = []
    for (let i = 0; i < MAX_LOG_ENTRIES + 10; i++) {
      log = appendCommandLogEntry(log, {
        id: i,
        timestamp: "t",
        source: "OSC",
        command: `cmd-${i}`,
      })
    }
    expect(log).toHaveLength(MAX_LOG_ENTRIES)
    // Newest is first.
    expect(log[0].id).toBe(MAX_LOG_ENTRIES + 9)
    expect(log[MAX_LOG_ENTRIES - 1].id).toBe(10)
  })

  it("stripRemotePrefix removes the remote: prefix", () => {
    expect(stripRemotePrefix("remote:next")).toBe("next")
    expect(stripRemotePrefix("remote:on_air")).toBe("on_air")
  })

  it("parsePort falls back on empty or non-numeric input", () => {
    expect(parsePort("9000", 8000)).toBe(9000)
    expect(parsePort("", 8000)).toBe(8000)
    expect(parsePort("abc", 8080)).toBe(8080)
  })
})
