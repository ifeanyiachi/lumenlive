import type { StateCreator } from "zustand"
import type { BroadcastState } from "./types"

/**
 * The Theme Designer's open/close flag. Theme *authoring* moved to the typed
 * `Theme` store + the shared slide editor (themeredo.md) — the legacy fixed-slot
 * draft designer (draftTheme, element ops, undo/redo, live-preview push) is gone.
 * The new designer dialog still uses this boolean as its open state.
 */
export type ThemeDesignerSlice = Pick<
  BroadcastState,
  "isDesignerOpen" | "setDesignerOpen"
>

export const createThemeDesignerSlice: StateCreator<
  BroadcastState,
  [],
  [],
  ThemeDesignerSlice
> = (set) => ({
  isDesignerOpen: false,
  setDesignerOpen: (isDesignerOpen) => set({ isDesignerOpen }),
})
