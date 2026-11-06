import { describe, expect, it } from "vitest"

import {
  formatBytes,
  formatCcliDate,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatTime,
} from "./format"

describe("localized formatting", () => {
  it("uses the supplied locale for numbers and byte sizes", () => {
    expect(formatNumber(1234.5, undefined, "en")).toBe("1,234.5")
    expect(formatNumber(1234.5, undefined, "fr")).not.toBe("1,234.5")
    expect(
      formatNumber(
        1.5,
        { minimumFractionDigits: 1, maximumFractionDigits: 1 },
        "fr"
      )
    ).not.toBe("1.5")
    expect(formatBytes(1536, "en")).toBe("1.5 KB")
    expect(formatBytes(1536, "fr")).not.toBe("1.5 KB")
  })

  it("formats durations as readable clock values", () => {
    expect(formatDuration(65_000, "en")).toBe("1:05")
    expect(formatDuration(3_661_000, "en")).toBe("1:01:01")
  })

  it("formats display dates and stable CCLI export dates", () => {
    const value = new Date(2026, 8, 16, 14, 5)
    expect(formatDateTime(value, "fr")).toBeTruthy()
    expect(formatTime(value, "es")).toBeTruthy()
    expect(formatCcliDate(value)).toBe("2026-09-16")
  })
})
