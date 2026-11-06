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

const ADMIN_OWNED: Entitlement = {
  tier: "admin-owned",
  features: [...FREE_FEATURES, "cloud_stt"],
  limits: { maxDevices: 5, maxTranslations: -1, maxTranscriptionMinutes: -1 },
  trialEnd: null,
}

describe("can", () => {
  it("grants a free feature to the Free entitlement", () => {
    expect(can(FREE_ENTITLEMENT, "bible_search")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "cloud_stt")).toBe(true)
    // Free keeps direct verse detection (explicit spoken references)…
    expect(can(FREE_ENTITLEMENT, "direct_detection")).toBe(true)
  })

  it("grants every formerly paid feature without a license", () => {
    expect(can(FREE_ENTITLEMENT, "ndi_output")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "lexicon")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "theme_designer")).toBe(true)
    // …but the meaning-based detection channels, acting on detections, Context
    // search, and media all moved to Starter.
    expect(can(FREE_ENTITLEMENT, "semantic_detection")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "quotation_detection")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "paraphrase_detection")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "detection_actions")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "context_search")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "media_images")).toBe(true)
    expect(can(FREE_ENTITLEMENT, "media_video_audio")).toBe(true)
  })

  it("grants paid features to a Pro entitlement", () => {
    expect(can(PRO, "ndi_output")).toBe(true)
    expect(can(PRO, "remote_control")).toBe(true)
    expect(can(PRO, "bible_search")).toBe(true) // still includes Free
  })

  it("grants offline STT to admin-owned accounts without the token flag", () => {
    expect(can(ADMIN_OWNED, "offline_stt")).toBe(true)
  })

  it("grants offline STT independently of legacy tier flags", () => {
    expect(can(PRO, "offline_stt")).toBe(true)
  })

  it("denies unknown keys", () => {
    expect(can(PRO, "totally_made_up")).toBe(false)
  })
})

describe("limit / unlimited", () => {
  it("reads numeric caps", () => {
    expect(limit(FREE_ENTITLEMENT, "maxDevices")).toBe(-1)
    expect(limit(FREE_ENTITLEMENT, "maxTranslations")).toBe(-1)
    expect(limit(PRO, "maxDevices")).toBe(-1)
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

  it("labels legacy trials as Free", () => {
    expect(planLabel(mk("pro", 1_800_000_000))).toBe("Free")
    expect(planLabel(mk("starter", 1_800_000_000))).toBe("Free")
  })

  it("labels legacy paid subscriptions as Free", () => {
    expect(planLabel(mk("starter", null))).toBe("Free")
    expect(planLabel(mk("pro", null))).toBe("Free")
  })

  it("labels custom legacy tiers as Free", () => {
    expect(planLabel(mk("admin-owned", null))).toBe("Free")
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
  it("includes the full free capability catalog without platform minutes", () => {
    expect(FREE_ENTITLEMENT.features).toHaveLength(31)
    expect(FREE_ENTITLEMENT.tier).toBe("free")
    expect(FREE_ENTITLEMENT.trialEnd).toBeNull()
    expect(FREE_ENTITLEMENT.limits.maxTranscriptionMinutes).toBe(0)
  })
})
