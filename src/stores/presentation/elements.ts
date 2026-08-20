import type { StateCreator } from "zustand"
import {
  createDefaultTextElement,
  createDefaultImageElement,
  createDefaultScriptureElement,
  createDefaultShapeElement,
  createDefaultVideoElement,
  createDefaultTimerElement,
} from "@/lib/slide-defaults"
import * as slides from "@/lib/presentation/slide-mutations"
import { pushUndo, pushUndoDebounced } from "./internals"
import type { PresentationState } from "./types"

/**
 * Element-level draft editing on the active slide: slide/element patches, the
 * batched multi-element rebuild (`updateDraftElementsBatch` — the drag hot
 * path), element creation/removal/stacking, multi-select, and inline (on-canvas)
 * text editing. Owns `selectedElementId`, `editingTextElementId`, and
 * `selectedElementIds`. Undo snapshots go through the shared history helpers:
 * debounced for continuous edits, immediate for discrete structural changes.
 */
export type ElementsSlice = Pick<
  PresentationState,
  | "selectedElementId"
  | "editingTextElementId"
  | "selectedElementIds"
  | "updateDraftSlide"
  | "updateDraftElement"
  | "updateDraftElementsBatch"
  | "beginTextEdit"
  | "commitTextEdit"
  | "cancelTextEdit"
  | "addElement"
  | "addImageElement"
  | "addScriptureElement"
  | "addShapeElement"
  | "addVideoElement"
  | "addTimerElement"
  | "removeElement"
  | "setSelectedElement"
  | "reorderElement"
  | "moveElementToTop"
  | "moveElementToBottom"
  | "moveElementUp"
  | "moveElementDown"
  | "toggleSelectElement"
  | "clearMultiSelect"
  | "removeSelectedElements"
  | "updateSelectedElements"
>

export const createElementsSlice: StateCreator<
  PresentationState,
  [],
  [],
  ElementsSlice
> = (set) => ({
  selectedElementId: null,
  editingTextElementId: null,
  selectedElementIds: [],

  updateDraftSlide: (updates) =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndoDebounced(s.draftPresentation)
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          updates,
          Date.now()
        ),
      }
    }),

  updateDraftElement: (elementId, updates) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      return {
        draftPresentation: slides.updateElementOnSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          elementId,
          updates,
          Date.now()
        ),
      }
    }),

  updateDraftElementsBatch: (updatesById) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const map = new Map(Object.entries(updatesById))
      if (map.size === 0) return s
      const elements = slides.updateElementsById(slide.elements, map)
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),

  // ── Inline (on-canvas) text editing ──
  // Selects the element and marks it as the inline-edit target. Text isn't
  // written to the draft until commit, so a canceled edit leaves the draft
  // untouched.
  beginTextEdit: (elementId) =>
    set({
      selectedElementId: elementId,
      selectedElementIds: [],
      editingTextElementId: elementId,
    }),

  // Writes the edited text back to the draft in a single mutation, snapshotting
  // undo once (only when the text actually changed) so the whole edit collapses
  // into one undo step. Always clears the inline-edit target.
  commitTextEdit: (elementId, text) =>
    set((s) => {
      if (!s.draftPresentation) return { editingTextElementId: null }
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      const el = slide?.elements.find((e) => e.id === elementId)
      if (!el || el.type !== "text" || el.text === text) {
        return { editingTextElementId: null }
      }
      pushUndo(s.draftPresentation)
      return {
        editingTextElementId: null,
        draftPresentation: slides.updateElementOnSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          elementId,
          { text },
          Date.now()
        ),
      }
    }),

  cancelTextEdit: () => set({ editingTextElementId: null }),

  addElement: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const el = createDefaultTextElement()
      return {
        draftPresentation: slides.appendElementToSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          el,
          Date.now()
        ),
        selectedElementId: el.id,
      }
    }),

  addImageElement: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const el = createDefaultImageElement()
      return {
        draftPresentation: slides.appendElementToSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          el,
          Date.now()
        ),
        selectedElementId: el.id,
      }
    }),

  addScriptureElement: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const el = createDefaultScriptureElement()
      return {
        draftPresentation: slides.appendElementToSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          el,
          Date.now()
        ),
        selectedElementId: el.id,
      }
    }),

  addShapeElement: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const el = createDefaultShapeElement()
      return {
        draftPresentation: slides.appendElementToSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          el,
          Date.now()
        ),
        selectedElementId: el.id,
      }
    }),

  addVideoElement: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const el = createDefaultVideoElement()
      return {
        draftPresentation: slides.appendElementToSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          el,
          Date.now()
        ),
        selectedElementId: el.id,
        selectedElementIds: [],
      }
    }),

  addTimerElement: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const el = createDefaultTimerElement()
      return {
        draftPresentation: slides.appendElementToSlide(
          s.draftPresentation,
          s.activeSlideIndex,
          el,
          Date.now()
        ),
        selectedElementId: el.id,
        selectedElementIds: [],
      }
    }),

  toggleSelectElement: (id) =>
    set((s) => {
      const ids = s.selectedElementIds.includes(id)
        ? s.selectedElementIds.filter((i) => i !== id)
        : [...s.selectedElementIds, id]
      return {
        selectedElementIds: ids,
        selectedElementId: ids[ids.length - 1] ?? null,
      }
    }),

  clearMultiSelect: () => set({ selectedElementIds: [] }),

  removeSelectedElements: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const ids =
        s.selectedElementIds.length > 0
          ? s.selectedElementIds
          : s.selectedElementId
            ? [s.selectedElementId]
            : []
      if (ids.length === 0) return s
      pushUndo(s.draftPresentation)
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.removeElements(slide.elements, ids)
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
        selectedElementId: elements[0]?.id ?? null,
        selectedElementIds: [],
      }
    }),

  updateSelectedElements: (updates) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const ids =
        s.selectedElementIds.length > 0
          ? s.selectedElementIds
          : s.selectedElementId
            ? [s.selectedElementId]
            : []
      if (ids.length === 0) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.updateElements(slide.elements, ids, updates)
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),

  removeElement: (elementId) =>
    set((s) => {
      if (!s.draftPresentation) return s
      pushUndo(s.draftPresentation)
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.removeElements(slide.elements, [elementId])
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
        selectedElementId:
          s.selectedElementId === elementId
            ? (elements[0]?.id ?? null)
            : s.selectedElementId,
      }
    }),

  setSelectedElement: (selectedElementId) => set({ selectedElementId }),

  reorderElement: (fromIndex, toIndex) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.reorderElements(
        slide.elements,
        fromIndex,
        toIndex
      )
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),

  moveElementToTop: (elementId) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.moveElementToTop(slide.elements, elementId)
      if (!elements) return s
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),

  moveElementToBottom: (elementId) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.moveElementToBottom(slide.elements, elementId)
      if (!elements) return s
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),

  moveElementUp: (elementId) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.moveElementUp(slide.elements, elementId)
      if (!elements) return s
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),

  moveElementDown: (elementId) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = s.draftPresentation.slides[s.activeSlideIndex]
      if (!slide) return s
      const elements = slides.moveElementDown(slide.elements, elementId)
      if (!elements) return s
      return {
        draftPresentation: slides.updateSlideAt(
          s.draftPresentation,
          s.activeSlideIndex,
          { elements },
          Date.now()
        ),
      }
    }),
})
