import { describe, it, expect } from "vitest"
import {
  can,
  limit,
  isUnlimited,
  withinLimit,
  trialRemaining,
  planLabel,
  FREE_ENTITLEMENT,
  FREE_FEATURES,
  type Entitlement,
} from "./index"

const PRO: Entitlement = {
  tier: "pro",
  features: [...FREE_FEATURES, "ndi_output", "lexicon", "remote_control"],
  limits: { maxDevices: 5, maxTranslations: -1, maxTranscriptionMinutes: 60 },
  trialEnd: 1_800_000_000,
}

describe("can", () => {
  it("grants a free feature to the Free entitlement", () => {
    expect(can(FREE_ENTITLEMENT, "bible_search")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "cloud_stt")).toBe(true)
    // Free keeps direct verse detection (explicit spoken references)…
    expect(can(FREE_ENTITLEMENT, "direct_detection")).toBe(true)
  })

  it("denies a paid feature to the Free entitlement", () => {
    expect(can(FREE_ENTITLEMENT, "ndi_output")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "lexicon")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "theme_designer")).toBe(false)
    // …but the meaning-based detection channels, acting on detections, Context
    // search, and media all moved to Starter.
    expect(can(FREE_ENTITLEMENT, "semantic_detection")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "quotation_detection")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "paraphrase_detection")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "detection_actions")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "context_search")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "media_images")).toBe(false)
    expect(can(FREE_ENTITLEMENT, "media_video_audio")).toBe(false)
  })

  it("grants paid features to a Pro entitlement", () => {
    expect(can(PRO, "ndi_output")).toBe(true)
    expect(can(PRO, "remote_control")).toBe(true)
    expect(can(PRO, "bible_search")).toBe(true) // still includes Free
  })

  it("denies unknown keys", () => {
    expect(can(PRO, "totally_made_up")).toBe(false)
  })
})

describe("limit / unlimited", () => {
  it("reads numeric caps", () => {
    expect(limit(FREE_ENTITLEMENT, "maxDevices")).toBe(1)
    expect(limit(FREE_ENTITLEMENT, "maxTranslations")).toBe(2)
    expect(limit(PRO, "maxDevices")).toBe(5)
  })

  it("treats -1 as unlimited", () => {
    expect(isUnlimited(-1)).toBe(true)
    expect(isUnlimited(0)).toBe(false)
    expect(isUnlimited(2)).toBe(false)
    expect(limit(PRO, "maxTranslations")).toBe(-1)
  })

  it("enforces counts against caps", () => {
    expect(withinLimit(2, 2)).toBe(true)
    expect(withinLimit(2, 3)).toBe(false)
    expect(withinLimit(-1, 9999)).toBe(true) // unlimited
  })
})

describe("planLabel", () => {
  const mk = (
    tier: Entitlement["tier"],
    trialEnd: number | null
  ): Entitlement => ({
    tier,
    features: [],
    limits: { maxDevices: 1, maxTranslations: 1, maxTranscriptionMinutes: 60 },
    trialEnd,
  })

  it("labels Free as Free (never a trial)", () => {
    expect(planLabel(FREE_ENTITLEMENT)).toBe("Free")
    expect(planLabel(mk("free", 123))).toBe("Free")
  })

  it("labels a paid tier with a trial deadline as Free trial", () => {
    expect(planLabel(mk("pro", 1_800_000_000))).toBe("Free trial")
    expect(planLabel(mk("starter", 1_800_000_000))).toBe("Free trial")
  })

  it("labels a perpetual paid subscription by its tier", () => {
    expect(planLabel(mk("starter", null))).toBe("Starter")
    expect(planLabel(mk("pro", null))).toBe("Pro")
  })

  it("preserves the label for an admin-managed custom tier", () => {
    expect(planLabel(mk("admin-owned", null))).toBe("Admin Owned")
  })
})

describe("trialRemaining", () => {
  const now = 1_700_000_000_000 // fixed "now" in ms

  it("reports days + hours left before the deadline", () => {
    const end = now / 1000 + (2 * 24 + 5) * 3600 // 2d 5h ahead
    const r = trialRemaining(end, now)
    expect(r.expired).toBe(false)
    expect(r.days).toBe(2)
    expect(r.hours).toBe(5)
  })

  it("reports expired once the deadline has passed", () => {
    const end = now / 1000 - 3600 // an hour ago
    const r = trialRemaining(end, now)
    expect(r.expired).toBe(true)
    expect(r.days).toBe(0)
    expect(r.hours).toBe(0)
  })
})

describe("FREE_ENTITLEMENT", () => {
  it("has exactly the 8 free features and Free limits", () => {
    expect(FREE_ENTITLEMENT.features).toHaveLength(8)
    expect(FREE_ENTITLEMENT.tier).toBe("free")
    expect(FREE_ENTITLEMENT.trialEnd).toBeNull()
    expect(FREE_ENTITLEMENT.limits.maxTranscriptionMinutes).toBe(60)
  })
})
