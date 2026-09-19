/**
 * Client-side feature gating (betaplan Phase C, step 3).
 *
 * Pure logic over a plain {@link Entitlement} snapshot — no React, Zustand, or
 * Tauri. The desktop app gates a capability by asking `can(entitlement, key)`;
 * numeric caps come from `limit(entitlement, key)`.
 *
 * The **default is Free**: with no license, an expired/tampered token, or a
 * failed offline verify, the client falls back to {@link FREE_ENTITLEMENT}. A
 * *licensed* snapshot's `features`/`limits` come straight from the signed token
 * (LumenBO is the source of truth); the Free set below is only the fallback and
 * mirrors `lumenbo/featurebase.md` / `entitlements.ts`.
 */

/**
 * Tier slugs are admin-managed by LumenBO, so the desktop must accept custom
 * values such as `admin-owned` in addition to the launch tiers.
 */
export type PlanTier = string

/** Numeric entitlement caps. `-1` = unlimited. Mirrors LumenBO `PlanLimits`. */
export interface Limits {
  maxDevices: number
  maxTranslations: number
  maxTranscriptionMinutes: number
}

/** A resolved entitlement the gates read from. */
export interface Entitlement {
  tier: PlanTier
  features: string[]
  limits: Limits
  /** Real access deadline (unix secs); `null` for Free / perpetual. */
  trialEnd: number | null
}

/**
 * The Free feature set — everyone gets these, licensed or not. Transcription
 * (`cloud_stt`) and direct verse detection are free up to the 60-minute
 * one-time allowance in `maxTranscriptionMinutes`, on platform-managed keys.
 * Free keeps only `direct_detection`; the meaning-based detection
 * channels, acting on detections (`detection_actions`), Context search
 * (`context_search`), and media are Starter. Free stages/previews any content
 * but can send only scripture to live output (the `takeToLive` gate).
 * Keep in lockstep with `lumenbo/src/lib/entitlements.ts` FREE_FEATURES.
 */
export const FREE_FEATURES = [
  "bible_search",
  "cross_references",
  "single_output",
  "cloud_stt",
  "direct_detection",
  "verse_queue",
  "multi_translation",
  "schedule",
] as const

/** Free-tier limits (see `featurebase.md`). */
export const FREE_LIMITS: Limits = {
  maxDevices: 1,
  maxTranslations: 2,
  maxTranscriptionMinutes: 60,
}

/** The fallback entitlement applied whenever no valid license is present. */
export const FREE_ENTITLEMENT: Entitlement = {
  tier: "free",
  features: [...FREE_FEATURES],
  limits: { ...FREE_LIMITS },
  trialEnd: null,
}

/** Whether the entitlement unlocks `key`. Unknown keys are denied. */
export function can(entitlement: Entitlement, key: string): boolean {
  return entitlement.features.includes(key)
}

/**
 * The user-facing plan label for the current entitlement. Built-in tiers keep
 * their familiar labels; custom admin-managed tiers are derived from their
 * slug (for example, `admin-owned` becomes `Admin Owned`).
 *
 * A non-null `trialEnd` marks a *time-limited* grant of a paid tier (a gifted
 * trial), shown as "Free trial"; a perpetual paid subscription has `trialEnd`
 * null and shows its tier name. Free is always "Free". Pure over the snapshot —
 * expiry is the store's job (it drops the entitlement back to Free once the
 * deadline passes), so this needs no clock.
 */
export function planLabel(entitlement: Entitlement): string {
  if (entitlement.tier === "free") return "Free"
  if (entitlement.trialEnd != null) return "Free trial"
  return tierLabel(entitlement.tier)
}

/** Convert an admin-managed tier slug into a readable label. */
function tierLabel(tier: PlanTier): string {
  return tier
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ")
}

/** The numeric cap for `key`. `-1` means unlimited (see {@link isUnlimited}). */
export function limit(entitlement: Entitlement, key: keyof Limits): number {
  return entitlement.limits[key]
}

/** A `-1` cap means "no limit". */
export function isUnlimited(value: number): boolean {
  return value < 0
}

/**
 * Whether a value is within a cap. Unlimited (`-1`) is always within; otherwise
 * `count <= cap`. Used by callers enforcing device/translation counts.
 */
export function withinLimit(cap: number, count: number): boolean {
  return isUnlimited(cap) || count <= cap
}

/** How much of a trial/subscription window is left, for the Account countdown. */
export interface TrialRemaining {
  expired: boolean
  totalMs: number
  days: number
  hours: number
}

/**
 * Time remaining until `trialEndSecs` (a unix-seconds deadline), split into
 * whole days + hours. Past the deadline it reports `expired` with zeroed parts.
 */
export function trialRemaining(
  trialEndSecs: number,
  nowMs: number = Date.now()
): TrialRemaining {
  const totalMs = trialEndSecs * 1000 - nowMs
  if (totalMs <= 0) {
    return { expired: true, totalMs: 0, days: 0, hours: 0 }
  }
  const hoursTotal = Math.floor(totalMs / (60 * 60 * 1000))
  return {
    expired: false,
    totalMs,
    days: Math.floor(hoursTotal / 24),
    hours: hoursTotal % 24,
  }
}
