import type { StageLayout } from "@/types/stage-layout"
import type { VerseRenderData } from "@/types/broadcast"
import type { Slide } from "@/types/slide"
import type { StageDisplayData, StageTimer } from "@/lib/stage-display-renderer"

/** The per-output live context a stage-update payload wraps around a layout. */
export interface StageUpdateContext {
  currentVerse: VerseRenderData | null
  currentSlide: Slide | null
  notes: string | null
  timer: StageTimer | null
  message: string | null
  announcement: string | null
  playlist: string[] | null
}

/**
 * Assemble the `stage-update` payload for one output. Shared by both stage
 * emitters — the live `syncStageOutput` and the designer draft preview
 * `emitStageDraftToOutputs` — so the payload shape lives in exactly one place.
 */
export function buildStageUpdatePayload(
  layout: StageLayout,
  ctx: StageUpdateContext
): StageDisplayData {
  return {
    layout,
    currentVerse: ctx.currentVerse,
    currentSlide: ctx.currentSlide,
    notes: ctx.notes,
    timer: ctx.timer,
    message: ctx.message,
    announcement: ctx.announcement,
    playlist: ctx.playlist,
  }
}
