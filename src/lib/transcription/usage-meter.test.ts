import { describe, it, expect } from "vitest"

import {
  MAX_USAGE_DELTA_SECONDS,
  sanitizeUsageDelta,
  shouldReportUsage,
} from "./usage-meter"

describe("sanitizeUsageDelta", () => {
  it("rounds a fractional delta to whole seconds", () => {
    expect(sanitizeUsageDelta(59.4)).toBe(59)
    expect(sanitizeUsageDelta(60.6)).toBe(61)
  })

  it("drops non-positive values", () => {
    expect(sanitizeUsageDelta(0)).toBe(0)
    expect(sanitizeUsageDelta(-5)).toBe(0)
  })

  it("drops non-finite values", () => {
    expect(sanitizeUsageDelta(NaN)).toBe(0)
    expect(sanitizeUsageDelta(Infinity)).toBe(0)
  })

  it("clamps implausible spikes to the endpoint's max", () => {
    expect(sanitizeUsageDelta(1_000_000)).toBe(MAX_USAGE_DELTA_SECONDS)
  })
})

describe("shouldReportUsage", () => {
  it("reports only positive deltas", () => {
    expect(shouldReportUsage(1)).toBe(true)
    expect(shouldReportUsage(0)).toBe(false)
  })
})
