import { describe, it, expect } from "vitest"

import { decideTranscriptionStart, describeBlock, isMetered } from "./access"
import type { TranscriptionResolution } from "./types"

function resolution(
  over: Partial<TranscriptionResolution> = {}
): TranscriptionResolution {
  return {
    mode: "platform_trial",
    key: "dg_test_key",
    tier: "pro",
    allowanceMinutes: 60,
    usedMinutes: 10,
    remainingMinutes: 50,
    ...over,
  }
}

describe("decideTranscriptionStart", () => {
  it("starts with the resolved key for platform_trial", () => {
    const d = decideTranscriptionStart(resolution())
    expect(d).toEqual({
      action: "start",
      key: "dg_test_key",
      mode: "platform_trial",
    })
  })

  it("starts for platform_paid too", () => {
    const d = decideTranscriptionStart(
      resolution({ mode: "platform_paid", key: "dg_x" })
    )
    expect(d).toMatchObject({
      action: "start",
      key: "dg_x",
      mode: "platform_paid",
    })
  })

  it("starts team BYOK without treating it as a finite platform allowance", () => {
    const d = decideTranscriptionStart(
      resolution({
        mode: "team_byok",
        key: "team-provider-key",
        remainingMinutes: null,
        allowanceMinutes: -1,
      })
    )
    expect(d).toEqual({
      action: "start",
      key: "team-provider-key",
      mode: "team_byok",
    })
    expect(isMetered({ remainingMinutes: null })).toBe(false)
  })

  it("blocks with allowance copy when exhausted", () => {
    const d = decideTranscriptionStart(
      resolution({
        mode: "blocked",
        key: undefined,
        reason: "allowance_exhausted",
      })
    )
    expect(d.action).toBe("blocked")
    if (d.action === "blocked") {
      expect(d.reason).toBe("allowance_exhausted")
      expect(d.copy.title).toMatch(/minutes/i)
    }
  })

  it("blocks for platform_key_unset with distinct copy", () => {
    const unset = decideTranscriptionStart(
      resolution({
        mode: "blocked",
        key: undefined,
        reason: "platform_key_unset",
      })
    )
    expect(unset).toMatchObject({
      action: "blocked",
      reason: "platform_key_unset",
    })
    if (unset.action === "blocked") {
      expect(unset.copy.title).not.toBe(describeBlock(undefined).title)
    }
  })

  it.each([
    ["team_key_unset", /team|administrator/i],
    ["platform_disabled", /platform|team key/i],
  ] as const)("shows distinct recovery copy for %s", (reason, expected) => {
    const blocked = decideTranscriptionStart(
      resolution({ mode: "blocked", key: undefined, reason })
    )
    expect(blocked).toMatchObject({ action: "blocked", reason })
    if (blocked.action === "blocked") {
      expect(blocked.copy.title).toMatch(expected)
      expect(blocked.copy.message).toMatch(expected)
    }
  })

  it("prompts a Free account to start a trial or upgrade", () => {
    const d = decideTranscriptionStart(
      resolution({ mode: "blocked", key: undefined, reason: "no_subscription" })
    )
    expect(d).toMatchObject({ action: "blocked", reason: "no_subscription" })
    if (d.action === "blocked") expect(d.copy.title).toMatch(/trial|upgrade/i)
  })

  it("blocks defensively when a non-blocked mode arrives without a key", () => {
    const d = decideTranscriptionStart(
      resolution({ mode: "platform_paid", key: undefined })
    )
    expect(d.action).toBe("blocked")
  })
})

describe("describeBlock", () => {
  it("falls back to generic copy for an unknown/missing reason", () => {
    expect(describeBlock(undefined).title).toBe("Transcription unavailable")
  })
})

describe("isMetered", () => {
  it("is true for a finite remaining allowance", () => {
    expect(isMetered({ remainingMinutes: 50 })).toBe(true)
    expect(isMetered({ remainingMinutes: 0 })).toBe(true)
  })

  it("is false when remaining is null (unlimited / paid)", () => {
    expect(isMetered({ remainingMinutes: null })).toBe(false)
  })
})
