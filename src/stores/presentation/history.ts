import type { StateCreator } from "zustand"
import { applyUndo, applyRedo } from "./internals"
import type { PresentationState } from "./types"

/**
 * Undo / redo over the draft presentation. The snapshot stacks and their
 * `structuredClone`-based mechanics live in `./internals` (shared module state);
 * this slice just swaps the restored presentation into the draft and re-points
 * the selection at the active slide's first element, matching the monolithic
 * store. Owns no state of its own.
 */
export type HistorySlice = Pick<PresentationState, "undo" | "redo">

export const createHistorySlice: StateCreator<
  PresentationState,
  [],
  [],
  HistorySlice
> = (set) => ({
  undo: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const current = applyUndo(s.draftPresentation)
      if (!current) return s
      return {
        draftPresentation: current,
        selectedElementId:
          current.slides[s.activeSlideIndex]?.elements[0]?.id ?? null,
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const current = applyRedo(s.draftPresentation)
      if (!current) return s
      return {
        draftPresentation: current,
        selectedElementId:
          current.slides[s.activeSlideIndex]?.elements[0]?.id ?? null,
      }
    }),
})
