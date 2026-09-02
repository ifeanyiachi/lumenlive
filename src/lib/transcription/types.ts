/**
 * Transcription-key contract types (portalplan D2-06, mirrors the LumenBO
 * `/v1/transcription/*` responses in `docs/desktop-transcription-contract.md`).
 *
 * Kept in `lib/` (pure, no I/O) so both the routing logic here and the gateway
 * that fetches them share one definition without the gateway owning the types —
 * `lib/` never imports `services/`.
 */

import type { PlanTier } from "@/lib/entitlements"

/** Which key the platform decided this client may use right now. */
export type TranscriptionMode =
  | "platform_paid"
  | "platform_trial"
  | "byok"
  | "blocked"

/** Why transcription is blocked — only set when `mode === "blocked"`. */
export type BlockedReason =
  | "allowance_exhausted"
  | "platform_key_unset"
  | "byok_invalid"

/**
 * The full resolution from `POST /v1/transcription/key`, including the raw key.
 * The key is present unless `mode === "blocked"` and must not be persisted beyond
 * the current session (re-pull rather than cache — rotation takes effect next pull).
 */
export interface TranscriptionResolution {
  mode: TranscriptionMode
  key?: string
  reason?: BlockedReason
  tier: PlanTier
  /** Minutes allowance for this tier; `-1` = unlimited. Paid clients ignore it. */
  allowanceMinutes: number
  usedMinutes: number
  /** Remaining free/trial minutes; `null` when unlimited or on a paid plan. */
  remainingMinutes: number | null
  byokPresent: boolean
}

/**
 * The key-less status echoed by `POST /v1/transcription/usage` (same shape the
 * portal reads). Learned after reporting usage so the desktop knows when the
 * allowance is spent.
 */
export interface TranscriptionStatus {
  mode: TranscriptionMode
  reason?: BlockedReason
  tier: PlanTier
  allowanceMinutes: number
  usedMinutes: number
  remainingMinutes: number | null
  byokRequired: boolean
  byokConfigured: boolean
  byokLast4: string | null
  byokInvalid: boolean
}
