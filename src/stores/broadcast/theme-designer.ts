import type { StateCreator } from "zustand"
import type { BroadcastTheme } from "@/types"
import * as themeEditing from "@/lib/broadcast/theme-editing"
import * as history from "@/lib/broadcast/undo-history"
import { createUndoDebouncer } from "@/lib/broadcast/undo-debounce"
import type { BroadcastState, RegionId } from "./types"
import { emitDraftToBroadcast } from "./internals"

const UNDO_DEBOUNCE_MS = 300
// One debounce gate for the theme designer so a continuous gesture
// (slider/drag/color) records a single undo snapshot instead of one per event
// (CLAUDE.md gesture rule). Independent of the stage designer's gate.
const themeUndoDebounce = createUndoDebouncer(UNDO_DEBOUNCE_MS)

/**
 * The theme *designer*: an editable `draftTheme` with its own undo/redo stacks,
 * element ops, and the live-preview push to any output showing the theme being
 * edited. The persisted theme library lives in the theme-crud slice.
 */
export type ThemeDesignerSlice = Pick<
  BroadcastState,
  | "isDesignerOpen"
  | "editingThemeId"
  | "draftTheme"
  | "selectedElement"
  | "regionLocked"
  | "regionHidden"
  | "undoStack"
  | "redoStack"
  | "transitionPreviewTrigger"
  | "setDesignerOpen"
  | "startEditing"
  | "pushUndo"
  | "updateDraft"
  | "updateDraftNested"
  | "undo"
  | "redo"
  | "saveDraft"
  | "discardDraft"
  | "setSelectedElement"
  | "toggleRegionLocked"
  | "toggleRegionHidden"
  | "addElement"
  | "removeElement"
  | "reorderLayers"
  | "toggleElementVisibility"
  | "toggleElementLocked"
  | "triggerTransitionPreview"
  | "duplicateElement"
  | "nudgeElement"
>

export const createThemeDesignerSlice: StateCreator<
  BroadcastState,
  [],
  [],
  ThemeDesignerSlice
> = (set, get) => ({
  isDesignerOpen: false,
  editingThemeId: null,
  draftTheme: null,
  selectedElement: null,
  regionLocked: new Set<RegionId>(),
  regionHidden: new Set<RegionId>(),
  undoStack: [],
  redoStack: [],
  transitionPreviewTrigger: 0,

  setDesignerOpen: (isDesignerOpen) => {
    if (!isDesignerOpen) {
      set({
        isDesignerOpen,
        editingThemeId: null,
        draftTheme: null,
        selectedElement: null,
        undoStack: [],
        redoStack: [],
      })
    } else {
      set({ isDesignerOpen })
    }
  },
  startEditing: (themeId) => {
    const theme = get().themes.find((t) => t.id === themeId)
    if (!theme) return
    set({
      editingThemeId: themeId,
      draftTheme: themeEditing.createDraft(theme, Date.now()),
      selectedElement: null,
      undoStack: [],
      redoStack: [],
    })
  },
  pushUndo: () => {
    const { draftTheme, undoStack } = get()
    if (!draftTheme) return
    set({
      undoStack: history.pushSnapshot(undoStack, draftTheme),
      redoStack: [],
    })
  },
  updateDraft: (updates) => {
    themeUndoDebounce.maybePush(Date.now(), get().pushUndo)
    set((s) => ({
      draftTheme: s.draftTheme
        ? { ...s.draftTheme, ...updates, updatedAt: Date.now() }
        : null,
    }))
    emitDraftToBroadcast(get())
  },
  updateDraftNested: (path, value) => {
    themeUndoDebounce.maybePush(Date.now(), get().pushUndo)
    set((s) => ({
      draftTheme: s.draftTheme
        ? (themeEditing.setNestedValue(
            s.draftTheme as unknown as Record<string, unknown>,
            path,
            value
          ) as unknown as BroadcastTheme)
        : null,
    }))
    emitDraftToBroadcast(get())
  },
  undo: () => {
    const { undoStack, redoStack, draftTheme } = get()
    if (!draftTheme) return
    const step = history.undo(draftTheme, undoStack, redoStack)
    if (!step) return
    set({
      undoStack: step.undoStack,
      redoStack: step.redoStack,
      draftTheme: step.current,
    })
    emitDraftToBroadcast(get())
  },
  redo: () => {
    const { undoStack, redoStack, draftTheme } = get()
    if (!draftTheme) return
    const step = history.redo(draftTheme, undoStack, redoStack)
    if (!step) return
    set({
      undoStack: step.undoStack,
      redoStack: step.redoStack,
      draftTheme: step.current,
    })
    emitDraftToBroadcast(get())
  },
  saveDraft: () => {
    const { draftTheme } = get()
    if (!draftTheme) return
    if (draftTheme.builtin) {
      // Saving a built-in forks it into a new custom theme and keeps editing
      // that fork. It does NOT touch the active/default output theme — making
      // a theme the default is an explicit action (see setDefaultTheme).
      const customTheme = themeEditing.promoteBuiltinToCustom(
        draftTheme,
        crypto.randomUUID(),
        Date.now()
      )
      set((s) => ({
        themes: [...s.themes, customTheme],
        editingThemeId: customTheme.id,
        draftTheme: customTheme,
      }))
    } else {
      get().saveTheme(draftTheme)
    }
  },
  discardDraft: () => {
    const { editingThemeId } = get()
    if (editingThemeId) {
      get().startEditing(editingThemeId)
    }
  },
  setSelectedElement: (selectedElement) => set({ selectedElement }),
  toggleRegionLocked: (id) =>
    set((s) => {
      const next = new Set(s.regionLocked)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { regionLocked: next }
    }),
  toggleRegionHidden: (id) =>
    set((s) => {
      const next = new Set(s.regionHidden)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { regionHidden: next }
    }),
  addElement: (type) => {
    const { draftTheme } = get()
    if (!draftTheme) return
    get().pushUndo()
    const { draft, selectedId } = themeEditing.addElement(
      draftTheme,
      type,
      crypto.randomUUID(),
      Date.now()
    )
    set({ draftTheme: draft, selectedElement: selectedId })
    emitDraftToBroadcast(get())
  },
  removeElement: (id) => {
    const { draftTheme } = get()
    if (!draftTheme) return
    get().pushUndo()
    set((s) => ({
      draftTheme: themeEditing.removeElement(draftTheme, id, Date.now()),
      selectedElement: s.selectedElement === id ? null : s.selectedElement,
    }))
    emitDraftToBroadcast(get())
  },
  reorderLayers: (fromIndex, toIndex) => {
    const { draftTheme } = get()
    if (!draftTheme) return
    get().pushUndo()
    set({
      draftTheme: themeEditing.reorderLayers(
        draftTheme,
        fromIndex,
        toIndex,
        Date.now()
      ),
    })
    emitDraftToBroadcast(get())
  },
  toggleElementVisibility: (id) => {
    const { draftTheme } = get()
    if (!draftTheme) return
    set({ draftTheme: themeEditing.toggleElementVisibility(draftTheme, id) })
    emitDraftToBroadcast(get())
  },
  toggleElementLocked: (id) => {
    const { draftTheme } = get()
    if (!draftTheme) return
    set({ draftTheme: themeEditing.toggleElementLocked(draftTheme, id) })
  },
  triggerTransitionPreview: () => {
    set({ transitionPreviewTrigger: Date.now() })
  },
  duplicateElement: (id) => {
    const { draftTheme } = get()
    if (!draftTheme) return
    const result = themeEditing.duplicateElement(
      draftTheme,
      id,
      crypto.randomUUID(),
      Date.now()
    )
    if (!result) return
    get().pushUndo()
    set({ draftTheme: result.draft, selectedElement: result.selectedId })
    emitDraftToBroadcast(get())
  },
  nudgeElement: (dx, dy) => {
    const { draftTheme, selectedElement } = get()
    if (!draftTheme || !selectedElement) return
    const next = themeEditing.nudgeSelection(
      draftTheme,
      selectedElement,
      dx,
      dy,
      Date.now()
    )
    if (!next) return // no-op: unselected region, missing or locked element
    themeUndoDebounce.maybePush(Date.now(), get().pushUndo)
    set({ draftTheme: next })
    emitDraftToBroadcast(get())
  },
})
