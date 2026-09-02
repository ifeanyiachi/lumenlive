import type { DetectionResult } from "@/types/detection"

/**
 * Routing policy for AI verse detections.
 *
 * The detector runs two channels with very different trust levels:
 *
 * - **direct** — an explicit spoken reference ("John 3:16"). Exact: always
 *   worth showing, and the only channel allowed to drive the audience screen.
 * - **semantic** — a meaning/paraphrase guess from preaching prose. The vector
 *   search ALWAYS returns its nearest verses, even for speech that quotes no
 *   scripture at all, so these are suggestions, never certainties.
 *
 * These pure predicates encode the policy the Detection settings promise:
 *   1. the Confidence Threshold slider filters the AI Detections *panel*
 *      (semantic only — direct references always appear); and
 *   2. semantic hits are panel-only — they never auto-queue and never reach the
 *      audience/program output. A meaning-match must never take the screen on
 *      its own; the operator sends it deliberately.
 */

/**
 * Minimum confidence for a DIRECT reference to auto-display to the audience.
 *
 * Fixed and deliberately independent of the panel slider: lowering the slider
 * to surface more low-confidence *suggestions* must never weaken the live-output
 * guard. Direct references parse at ~1.0, so this only screens out genuinely
 * shaky parses.
 */
export const MIN_DIRECT_LIVE_CONFIDENCE = 0.9

/**
 * Whether a detection should appear in the AI Detections panel.
 *
 * Direct references always show — the speaker named them explicitly. Semantic
 * guesses show only at or above the operator's confidence floor; this is the
 * single thing the Confidence Threshold slider controls.
 */
export function passesPanelFloor(d: DetectionResult, floor: number): boolean {
  return d.source === "direct" || d.confidence >= floor
}

/** Filter a batch of detections down to those the panel should display. */
export function panelDetections(
  detections: DetectionResult[],
  floor: number
): DetectionResult[] {
  return detections.filter((d) => passesPanelFloor(d, floor))
}

/**
 * Whether a detection may be auto-added to the staging queue.
 *
 * Direct references auto-queue when the backend marked them (their confidence
 * cleared the auto-queue threshold). Semantic hits NEVER auto-queue — they are
 * panel-only suggestions.
 */
export function shouldAutoQueue(d: DetectionResult): boolean {
  return d.source === "direct" && d.auto_queued
}

/**
 * Whether a detection may auto-display to the audience/program output.
 *
 * ONLY direct references clear this gate, and only when they are a real,
 * high-confidence reference: not a chapter-only stub, not a low-trust narrative
 * mention (a book named in prose while Reading Mode tracks a different book).
 * Semantic hits are excluded outright.
 */
export function shouldAutoDisplayLive(
  d: DetectionResult,
  minConfidence: number = MIN_DIRECT_LIVE_CONFIDENCE
): boolean {
  return (
    d.source === "direct" &&
    !d.is_chapter_only &&
    d.narrative_mention !== true &&
    d.book_number > 0 &&
    d.confidence >= minConfidence
  )
}
