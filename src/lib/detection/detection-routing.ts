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
 * Minimum confidence for a DIRECT reference to auto-stage in Program Preview.
 *
 * Fixed and deliberately independent of the panel slider: lowering the slider
 * to surface more low-confidence *suggestions* must never weaken the live-output
 * guard. Direct references parse at ~1.0, so this screens out genuinely shaky
 * parses before they can replace a preview.
 */
export const MIN_DIRECT_PREVIEW_CONFIDENCE = 0.9

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
 * Whether a finalized detection may auto-stage into Program Preview.
 *
 * ONLY direct references clear this gate, and only when they are a real,
 * high-confidence reference rather than a chapter-only stub. Semantic hits are
 * excluded outright.
 */
export function shouldAutoStagePreview(
  d: DetectionResult,
  minConfidence: number = MIN_DIRECT_PREVIEW_CONFIDENCE
): boolean {
  return (
    d.source === "direct" &&
    !d.is_chapter_only &&
    d.book_number > 0 &&
    d.confidence >= minConfidence
  )
}

/**
 * Return all safe automatic-preview candidates from one finalized detection batch.
 *
 * Multiple direct references from one utterance are grouped by the caller into
 * one multi-verse render. Deduplicate repeated references in the batch while
 * retaining the highest-confidence result for each reference.
 */
export function autoPreviewCandidates(
  detections: DetectionResult[]
): DetectionResult[] {
  const unique = new Map<string, DetectionResult>()
  for (const detection of detections) {
    if (!shouldAutoStagePreview(detection)) continue
    const previous = unique.get(detection.verse_ref)
    if (!previous || detection.confidence > previous.confidence) {
      unique.set(detection.verse_ref, detection)
    }
  }

  return [...unique.values()]
}
