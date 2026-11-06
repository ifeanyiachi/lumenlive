/**
 * All known application capabilities are free. Licenses remain only as a
 * compatibility mechanism for authenticated transcription device sessions.
 * Transcription sign-in is enforced by its start controller.
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

/** Every application capability is free, including without a license. */
export const FREE_FEATURES = [
  "bible_search",
  "cross_references",
  "single_output",
  "cloud_stt",
  "offline_stt",
  "direct_detection",
  "reading_mode",
  "verse_queue",
  "multi_translation",
  "schedule",
  "theme_designer",
  "full_slides",
  "verse_editing",
  "pptx_import",
  "pdf_export",
  "countdown",
  "props",
  "alerts",
  "youtube_integration",
  "semantic_detection",
  "quotation_detection",
  "paraphrase_detection",
  "detection_actions",
  "context_search",
  "media_images",
  "media_video_audio",
  "lexicon",
  "ndi_output",
  "stage_display",
  "remote_control",
  "priority_support",
] as const

/** Account keys and platform transcription allowances are resolved separately. */
export const FREE_LIMITS: Limits = {
  maxDevices: -1,
  maxTranslations: -1,
  maxTranscriptionMinutes: 0,
}

/** The fallback entitlement applied whenever no valid license is present. */
export const FREE_ENTITLEMENT: Entitlement = {
  tier: "free",
  features: [...FREE_FEATURES],
  limits: { ...FREE_LIMITS },
  trialEnd: null,
}

/** Known capabilities are free; unknown keys remain denied. */
export function can(entitlement: Entitlement, key: string): boolean {
  void entitlement
  return (FREE_FEATURES as readonly string[]).includes(key)
}

/** Retained for account UI compatibility; paid tiers have been retired. */
export function planLabel(entitlement: Entitlement): string {
  void entitlement
  return "Free"
}

/** The numeric cap for `key`. `-1` means unlimited (see {@link isUnlimited}). */
export function limit(entitlement: Entitlement, key: keyof Limits): number {
  void entitlement
  return FREE_LIMITS[key]
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
