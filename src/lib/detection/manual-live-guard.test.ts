import { describe, expect, it } from "vitest"
import { aiMayTakeLive } from "./manual-live-guard"

describe("aiMayTakeLive (manual-live guard, Phase 4 / decision D)", () => {
  it("high-trust call always takes, over any source", () => {
    for (const src of ["schedule", "queue", "manual", "ai", null] as const) {
      expect(aiMayTakeLive(src, false)).toBe(true)
    }
  })

  it("low-trust call is blocked over operator-placed live", () => {
    expect(aiMayTakeLive("manual", true)).toBe(false)
    expect(aiMayTakeLive("queue", true)).toBe(false)
    expect(aiMayTakeLive("schedule", true)).toBe(false)
  })

  it("low-trust call may take when nothing operator-sourced is live", () => {
    // Empty output, or content the AI itself placed — nothing to protect.
    expect(aiMayTakeLive(null, true)).toBe(true)
    expect(aiMayTakeLive("ai", true)).toBe(true)
  })
})
