import type { StateCreator } from "zustand"
import type { StageLayout } from "@/types"
import * as stageEditing from "@/lib/stage-layout/editing"
import * as history from "@/lib/broadcast/undo-history"
import { createUndoDebouncer } from "@/lib/broadcast/undo-debounce"
import type { BroadcastState } from "./types"
import { emitStageDraftToOutputs } from "./internals"

const UNDO_DEBOUNCE_MS = 300
// The stage designer's own debounce gate (independent of the theme designer's).
const stageUndoDebounce = createUndoDebouncer(UNDO_DEBOUNCE_MS)

/**
 * The stage-layout *designer*: an editable `draftStageLayout` with its own
 * undo/redo stacks, zone ops, and a live-preview push to any stage output
 * assigned the layout being edited. Mirrors the theme designer; zone semantics
 * replace element semantics.
 */
export type StageDesignerSlice = Pick<
  BroadcastState,
  | "stageDesignerOpen"
  | "editingStageLayoutId"
  | "draftStageLayout"
  | "isNewStageDraft"
  | "selectedZone"
  | "stageUndoStack"
  | "stageRedoStack"
  | "setStageDesignerOpen"
  | "startEditingStageLayout"
  | "pushStageUndo"
  | "updateStageDraft"
  | "updateStageDraftNested"
  | "setSelectedZone"
  | "addZone"
  | "removeZone"
  | "reorderStageLayers"
  | "toggleZoneVisibility"
  | "toggleZoneLocked"
  | "duplicateZone"
  | "nudgeZone"
  | "stageUndo"
  | "stageRedo"
  | "saveStageDraft"
  | "discardStageDraft"
>

export const createStageDesignerSlice: StateCreator<
  BroadcastState,
  [],
  [],
  StageDesignerSlice
> = (set, get) => ({
  stageDesignerOpen: false,
  editingStageLayoutId: null,
  draftStageLayout: null,
  isNewStageDraft: false,
  selectedZone: null,
  stageUndoStack: [],
  stageRedoStack: [],

  setStageDesignerOpen: (open) => {
    if (!open) {
      set({
        stageDesignerOpen: false,
        editingStageLayoutId: null,
        draftStageLayout: null,
        isNewStageDraft: false,
        selectedZone: null,
        stageUndoStack: [],
        stageRedoStack: [],
      })
    } else {
      set({ stageDesignerOpen: true })
    }
  },
  startEditingStageLayout: (id) => {
    const layout = get().stageLayouts.find((l) => l.id === id)
    if (!layout) return
    set({
      stageDesignerOpen: true,
      editingStageLayoutId: id,
      draftStageLayout: stageEditing.createStageDraft(layout, Date.now()),
      isNewStageDraft: false,
      selectedZone: null,
      stageUndoStack: [],
      stageRedoStack: [],
    })
  },
  pushStageUndo: () => {
    const { draftStageLayout, stageUndoStack } = get()
    if (!draftStageLayout) return
    set({
      stageUndoStack: history.pushSnapshot(stageUndoStack, draftStageLayout),
      stageRedoStack: [],
    })
  },
  setSelectedZone: (selectedZone) => set({ selectedZone }),
  updateStageDraft: (updates) => {
    stageUndoDebounce.maybePush(Date.now(), get().pushStageUndo)
    set((s) => ({
      draftStageLayout: s.draftStageLayout
        ? { ...s.draftStageLayout, ...updates, updatedAt: Date.now() }
        : null,
    }))
    emitStageDraftToOutputs(get())
  },
  updateStageDraftNested: (path, value) => {
    stageUndoDebounce.maybePush(Date.now(), get().pushStageUndo)
    set((s) => ({
      draftStageLayout: s.draftStageLayout
        ? (stageEditing.setNestedValue(
            s.draftStageLayout as unknown as Record<string, unknown>,
            path,
            value
          ) as unknown as StageLayout)
        : null,
    }))
    emitStageDraftToOutputs(get())
  },
  addZone: (source) => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    get().pushStageUndo()
    const { draft, selectedId } = stageEditing.addZone(
      draftStageLayout,
      source,
      crypto.randomUUID(),
      Date.now()
    )
    set({ draftStageLayout: draft, selectedZone: selectedId })
    emitStageDraftToOutputs(get())
  },
  removeZone: (id) => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    get().pushStageUndo()
    set((s) => ({
      draftStageLayout: stageEditing.removeZone(
        draftStageLayout,
        id,
        Date.now()
      ),
      selectedZone: s.selectedZone === id ? null : s.selectedZone,
    }))
    emitStageDraftToOutputs(get())
  },
  reorderStageLayers: (fromIndex, toIndex) => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    get().pushStageUndo()
    set({
      draftStageLayout: stageEditing.reorderLayers(
        draftStageLayout,
        fromIndex,
        toIndex,
        Date.now()
      ),
    })
    emitStageDraftToOutputs(get())
  },
  toggleZoneVisibility: (id) => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    set({
      draftStageLayout: stageEditing.toggleZoneVisibility(draftStageLayout, id),
    })
    emitStageDraftToOutputs(get())
  },
  toggleZoneLocked: (id) => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    set({
      draftStageLayout: stageEditing.toggleZoneLocked(draftStageLayout, id),
    })
  },
  duplicateZone: (id) => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    const result = stageEditing.duplicateZone(
      draftStageLayout,
      id,
      crypto.randomUUID(),
      Date.now()
    )
    if (!result) return
    get().pushStageUndo()
    set({ draftStageLayout: result.draft, selectedZone: result.selectedId })
    emitStageDraftToOutputs(get())
  },
  nudgeZone: (dx, dy) => {
    const { draftStageLayout, selectedZone } = get()
    if (!draftStageLayout || !selectedZone) return
    const next = stageEditing.nudgeZone(
      draftStageLayout,
      selectedZone,
      dx,
      dy,
      Date.now()
    )
    if (!next) return
    stageUndoDebounce.maybePush(Date.now(), get().pushStageUndo)
    set({ draftStageLayout: next })
    emitStageDraftToOutputs(get())
  },
  stageUndo: () => {
    const { stageUndoStack, stageRedoStack, draftStageLayout } = get()
    if (!draftStageLayout) return
    const step = history.undo(draftStageLayout, stageUndoStack, stageRedoStack)
    if (!step) return
    set({
      stageUndoStack: step.undoStack,
      stageRedoStack: step.redoStack,
      draftStageLayout: step.current,
    })
    emitStageDraftToOutputs(get())
  },
  stageRedo: () => {
    const { stageUndoStack, stageRedoStack, draftStageLayout } = get()
    if (!draftStageLayout) return
    const step = history.redo(draftStageLayout, stageUndoStack, stageRedoStack)
    if (!step) return
    set({
      stageUndoStack: step.undoStack,
      stageRedoStack: step.redoStack,
      draftStageLayout: step.current,
    })
    emitStageDraftToOutputs(get())
  },
  saveStageDraft: () => {
    const { draftStageLayout } = get()
    if (!draftStageLayout) return
    if (draftStageLayout.builtin) {
      // Built-ins are immutable and re-seeded from constants on every load, so
      // an edit can only survive as a new custom fork. Repoint any stage output
      // still assigned the built-in at that fork — otherwise the fork is
      // orphaned and the output keeps rendering the pristine built-in, which is
      // exactly the "my edits reverted on reopen" bug.
      const builtinId = draftStageLayout.id
      const custom = stageEditing.promoteBuiltinToCustom(
        draftStageLayout,
        crypto.randomUUID(),
        Date.now()
      )
      set((s) => ({
        stageLayouts: [...s.stageLayouts, custom],
        editingStageLayoutId: custom.id,
        draftStageLayout: custom,
        outputs: s.outputs.map((o) =>
          o.stageLayoutId === builtinId ? { ...o, stageLayoutId: custom.id } : o
        ),
      }))
      get().syncStageOutput()
    } else {
      // Custom layout — `saveStageLayout` upserts by id, so this both creates a
      // brand-new (previously unsaved) layout and updates an existing one. Once
      // saved, the draft is no longer "new".
      get().saveStageLayout(draftStageLayout)
      if (get().isNewStageDraft) set({ isNewStageDraft: false })
    }
  },
  discardStageDraft: () => {
    const { editingStageLayoutId, isNewStageDraft } = get()
    // A never-saved draft has nothing in the library to revert to — reset it to
    // a fresh blank layout instead of leaving the edited draft in place.
    if (isNewStageDraft) {
      const blank = stageEditing.createBlankStageLayout(
        crypto.randomUUID(),
        Date.now()
      )
      set({
        editingStageLayoutId: blank.id,
        draftStageLayout: blank,
        selectedZone: null,
        stageUndoStack: [],
        stageRedoStack: [],
      })
      return
    }
    if (editingStageLayoutId)
      get().startEditingStageLayout(editingStageLayoutId)
  },
})
