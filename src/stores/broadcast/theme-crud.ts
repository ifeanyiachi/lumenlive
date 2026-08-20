import type { StateCreator } from "zustand"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import type { BroadcastState } from "./types"

/**
 * The legacy broadcast theme list + default-theme id. Theme *authoring* moved to
 * the typed `Theme` store (themeredo.md) — the CRUD actions and the fixed-slot
 * designer are gone. This slice now just seeds the persisted list the remaining
 * legacy consumers (persistence + the `output.themeId` alias source) read; it is
 * retired with `BroadcastTheme` itself once those consumers migrate.
 */
export type ThemeCrudSlice = Pick<BroadcastState, "themes" | "defaultThemeId">

export const createThemeCrudSlice: StateCreator<
  BroadcastState,
  [],
  [],
  ThemeCrudSlice
> = () => ({
  themes: [...BUILTIN_THEMES],
  defaultThemeId: BUILTIN_THEMES[0].id,
})
