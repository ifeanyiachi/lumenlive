import type { ActiveCountdown, CountdownFormat } from "@/types/alert"

/** Urgency colors applied when a timer crosses its warn/danger thresholds. */
export const WARN_COLOR = "#f59e0b"
export const DANGER_COLOR = "#ef4444"

/**
 * Pure countdown time math — the single source of truth shared by the operator
 * preview (`countdown-overlay.tsx`) and the broadcast canvas painter
 * (`lib/broadcast-output/overlays.ts`). No React/Zustand/Tauri here: every
 * function is a pure map from an `ActiveCountdown` (or its fields) plus an
 * injected `now` (epoch ms) to a value, so preview and output can never drift
 * and the whole surface is trivially testable.
 */

/**
 * Remaining seconds for a running countdown at `now`. Negative once expired.
 *
 * Duration mode subtracts paused time so a pause truly freezes the clock:
 * `accumulatedPausedMs` covers completed pause/resume cycles and, while
 * currently paused, the in-progress pause is subtracted too. Clock mode ignores
 * pause (you cannot pause a wall clock) and simply counts down to the target.
 */
export function computeRemainingSeconds(
  countdown: ActiveCountdown,
  now: number
): number {
  if (countdown.mode === "clock" && countdown.targetEpochMs != null) {
    return (countdown.targetEpochMs - now) / 1000
  }

  const currentPauseMs =
    countdown.state === "paused" && countdown.pausedAt != null
      ? now - countdown.pausedAt
      : 0
  const pausedMs = countdown.accumulatedPausedMs + currentPauseMs
  const activeElapsedMs = now - countdown.startedAt - pausedMs
  return countdown.durationSeconds - activeElapsedMs / 1000
}

/**
 * Format `remainingSec` for the given display format.
 *
 * With `allowNegative` false (default) negatives clamp to zero — byte-identical
 * to the historical formatter. With `allowNegative` true, a negative value (a
 * timer in overtime) renders with a leading "-" showing how far over it has run.
 */
export function formatCountdownTime(
  remainingSec: number,
  format: CountdownFormat,
  allowNegative = false
): string {
  const negative = remainingSec < 0
  const sign = negative && allowNegative ? "-" : ""
  const magnitude = negative && !allowNegative ? 0 : Math.abs(remainingSec)
  const secs = Math.max(0, Math.ceil(magnitude))

  if (format === "minutes") {
    return `${sign}${Math.ceil(secs / 60)}`
  }
  if (format === "hh:mm:ss") {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  }
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * Resolve a "HH:MM" time-of-day to the next matching absolute epoch ms, relative
 * to `now` (injected for determinism). If today's occurrence has already passed,
 * the target rolls to tomorrow — so "count down to 10:00 AM" always aims forward.
 * Returns `null` for a malformed time string.
 */
export function resolveTargetEpoch(
  targetTime: string,
  now: number
): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(targetTime.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null

  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  let target = d.getTime()
  if (target <= now) target += 24 * 60 * 60 * 1000
  return target
}

/**
 * The color the time text should paint in for `remaining` seconds: the danger
 * color at/under `dangerSeconds`, the warn color at/under `warnSeconds`,
 * otherwise the timer's own `textColor`. Overtime (remaining < 0) stays at
 * danger if a danger threshold is set, else the base color. Thresholds are
 * independent — a warn without a danger works, and vice versa.
 */
export function resolveTimeColor(
  remaining: number,
  timer: {
    textColor: string
    warnSeconds?: number
    dangerSeconds?: number
  }
): string {
  if (timer.dangerSeconds != null && remaining <= timer.dangerSeconds) {
    return DANGER_COLOR
  }
  if (timer.warnSeconds != null && remaining <= timer.warnSeconds) {
    return WARN_COLOR
  }
  return timer.textColor
}

/**
 * Fraction of the countdown still remaining, clamped to [0, 1] — for a progress
 * ring/bar. The total span is the duration (duration mode) or the start→target
 * gap (clock mode); an unknown or non-positive total yields 0. Overtime clamps
 * to 0 (the ring is empty once time is up).
 */
export function computeProgressRemaining(
  countdown: ActiveCountdown,
  now: number
): number {
  let total: number
  if (countdown.mode === "clock" && countdown.targetEpochMs != null) {
    total = (countdown.targetEpochMs - countdown.startedAt) / 1000
  } else {
    total = countdown.durationSeconds
  }
  if (!(total > 0)) return 0

  const remaining = computeRemainingSeconds(countdown, now)
  return Math.min(1, Math.max(0, remaining / total))
}
