/**
 * Pure unit conversions between the settings store's internal ranges and the
 * percentages shown in the UI. Kept side-effect-free and deterministic so the
 * section components can stay presentational.
 */

/** Store gain is 0.0–2.0; display it as 0–100% (50% is unity gain). */
export function gainToPercent(gain: number): number {
  return Math.round((gain / 2.0) * 100)
}

/** Convert a 0–100% slider value back to the store's 0.0–2.0 gain. */
export function percentToGain(percent: number): number {
  return (percent / 100) * 2.0
}

/** Store confidence threshold is 0.0–1.0; display it as 0–100%. */
export function thresholdToPercent(threshold: number): number {
  return Math.round(threshold * 100)
}

/** Convert a 0–100% slider value back to the store's 0.0–1.0 threshold. */
export function percentToThreshold(percent: number): number {
  return percent / 100
}

/** Bounds (ms) of the "Pause Sensitivity" slider — the total silence the local
 *  transcriber tolerates before ending an utterance. */
export const PAUSE_SILENCE_MIN_MS = 500
export const PAUSE_SILENCE_MAX_MS = 3000
export const PAUSE_SILENCE_STEP_MS = 100

/** Format a pause window in ms as a short seconds label, e.g. 1400 → "1.4s". */
export function formatPauseSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}
