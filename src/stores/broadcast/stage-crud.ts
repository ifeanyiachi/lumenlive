import type { StateCreator } from "zustand"
import { BUILTIN_STAGE_LAYOUTS } from "@/lib/stage-layout/builtin-stage-layouts"
import * as libraryCrud from "@/lib/broadcast/library-crud"
import * as stageEditing from "@/lib/stage-layout/editing"
import type { BroadcastState } from "./types"

/**
 * Stage-layout library management — the stage-side sibling of theme-crud.
 * Built-ins are non-deletable, duplicates/renames only touch custom layouts, and
 * pins are per-layout. Shares the same pure `library-crud` transforms; the only
 * stage-specific side-effect is re-syncing stage outputs after a save.
 */
export type StageCrudSlice = Pick<
  BroadcastState,
  | "stageLayouts"
  | "saveStageLayout"
  | "deleteStageLayout"
  | "duplicateStageLayout"
  | "renameStageLayout"
  | "togglePinStageLayout"
  | "createNewStageLayout"
>

export const createStageCrudSlice: StateCreator<
  BroadcastState,
  [],
  [],
  StageCrudSlice
> = (set, get) => ({
  stageLayouts: [...BUILTIN_STAGE_LAYOUTS],

  saveStageLayout: (layout) => {
    set((s) => ({
      stageLayouts: libraryCrud.upsertById(s.stageLayouts, layout),
    }))
    // Re-emit so any stage output pointing at this preset reflects the edit.
    get().syncStageOutput()
  },
  deleteStageLayout: (id) =>
    set((s) => ({
      stageLayouts: libraryCrud.removeCustomById(s.stageLayouts, id),
    })),
  duplicateStageLayout: (id) => {
    const source = get().stageLayouts.find((l) => l.id === id)
    if (!source) return
    const newLayout = libraryCrud.duplicateItem(
      source,
      crypto.randomUUID(),
      Date.now()
    )
    set((s) => ({ stageLayouts: [...s.stageLayouts, newLayout] }))
  },
  renameStageLayout: (id, name) =>
    set((s) => ({
      stageLayouts: libraryCrud.renameCustom(
        s.stageLayouts,
        id,
        name,
        Date.now()
      ),
    })),
  togglePinStageLayout: (id) =>
    set((s) => ({
      stageLayouts: libraryCrud.togglePinById(s.stageLayouts, id, Date.now()),
    })),
  createNewStageLayout: () => {
    // "New" seeds an in-memory draft only — the layout is not added to the
    // library until the user saves. `saveStageDraft` inserts it on first save.
    const layout = stageEditing.createBlankStageLayout(
      crypto.randomUUID(),
      Date.now()
    )
    set({
      stageDesignerOpen: true,
      editingStageLayoutId: layout.id,
      draftStageLayout: layout,
      isNewStageDraft: true,
      selectedZone: null,
      stageUndoStack: [],
      stageRedoStack: [],
    })
  },
})
