import type { StateCreator } from "zustand"
import { createDefaultSlide } from "@/lib/slide-defaults"
import * as slides from "@/lib/presentation/slide-mutations"
import { newId } from "./internals"
import type { PresentationState } from "./types"

/**
 * Slide-level draft operations: add / remove / duplicate / reorder slides and
 * the active-slide cursor. Owns `activeSlideIndex`. Each op keeps the selection
 * pointing at the first element of the resulting active slide, matching the
 * monolithic store. Pure slide-array transforms live in
 * `lib/presentation/slide-mutations`.
 */
export type SlidesSlice = Pick<
  PresentationState,
  | "activeSlideIndex"
  | "addSlide"
  | "removeSlide"
  | "duplicateSlide"
  | "reorderSlide"
  | "setActiveSlideIndex"
>

export const createSlidesSlice: StateCreator<
  PresentationState,
  [],
  [],
  SlidesSlice
> = (set) => ({
  activeSlideIndex: 0,

  addSlide: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = createDefaultSlide()
      const newIndex = s.draftPresentation.slides.length
      return {
        draftPresentation: slides.appendSlide(
          s.draftPresentation,
          slide,
          Date.now()
        ),
        activeSlideIndex: newIndex,
        selectedElementId: slide.elements[0]?.id ?? null,
      }
    }),

  removeSlide: (index) =>
    set((s) => {
      if (!s.draftPresentation || s.draftPresentation.slides.length <= 1)
        return s
      const draft = slides.removeSlideAt(s.draftPresentation, index, Date.now())
      const newIndex = Math.min(s.activeSlideIndex, draft.slides.length - 1)
      return {
        draftPresentation: draft,
        activeSlideIndex: newIndex,
        selectedElementId: draft.slides[newIndex]?.elements[0]?.id ?? null,
      }
    }),

  duplicateSlide: (index) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const draft = slides.duplicateSlideAt(
        s.draftPresentation,
        index,
        newId,
        Date.now()
      )
      if (!draft) return s
      const dup = draft.slides[index + 1]
      return {
        draftPresentation: draft,
        activeSlideIndex: index + 1,
        selectedElementId: dup.elements[0]?.id ?? null,
      }
    }),

  reorderSlide: (fromIndex, toIndex) =>
    set((s) => {
      if (!s.draftPresentation) return s
      return {
        draftPresentation: slides.reorderSlideAt(
          s.draftPresentation,
          fromIndex,
          toIndex,
          Date.now()
        ),
        activeSlideIndex: toIndex,
      }
    }),

  setActiveSlideIndex: (index) =>
    set((s) => {
      const slide = s.draftPresentation?.slides[index]
      return {
        activeSlideIndex: index,
        selectedElementId: slide?.elements[0]?.id ?? null,
        editingTextElementId: null,
      }
    }),
})
