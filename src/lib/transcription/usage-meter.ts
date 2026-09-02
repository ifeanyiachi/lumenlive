/**
 * Pure guards for desktop-reported transcription usage (portalplan D2-06).
 *
 * The Rust audio fan-out emits per-interval second *deltas* (`transcription_usage`).
 * This module sanitises those deltas before they're POSTed to `/v1/transcription/usage`:
 * the backend accepts `0 … 86400` and the desktop owns idempotency, so we drop
 * non-positive / non-finite values and clamp implausible spikes. No I/O.
 */

/** The endpoint's per-call upper bound (`z.number().max(86_400)` server-side). */
export const MAX_USAGE_DELTA_SECONDS = 86_400

/**
 * Normalise a raw usage delta into a whole number of seconds safe to report, or
 * `0` when there's nothing worth sending (the caller should skip the POST on 0).
 */
export function sanitizeUsageDelta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.min(Math.round(seconds), MAX_USAGE_DELTA_SECONDS)
}

/**
 * Whether a sanitised delta is worth reporting to the backend. Trivial today but
 * kept as the single predicate the hook checks, so the "skip empty reports" rule
 * lives in one tested place.
 */
export function shouldReportUsage(sanitizedSeconds: number): boolean {
  return sanitizedSeconds > 0
}
