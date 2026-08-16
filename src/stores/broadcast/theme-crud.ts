import type { StateCreator } from "zustand"
import type { BroadcastTheme } from "@/types"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import * as libraryCrud from "@/lib/broadcast/library-crud"
import type { BroadcastState } from "./types"

/**
 * Theme library management (create / save / rename / pin / duplicate / delete +
 * the default-theme designation). The designer draft lives in a separate slice;
 * this one owns the persisted list and the default id. Pure array transforms are
 * delegated to `lib/broadcast/library-crud`; this slice keeps the theme-specific
 * side-effects (applying the default to the main output, falling the default
 * back to a built-in on delete).
 */
export type ThemeCrudSlice = Pick<
  BroadcastState,
  | "themes"
  | "defaultThemeId"
  | "loadThemes"
  | "saveTheme"
  | "setDefaultTheme"
  | "deleteTheme"
  | "duplicateTheme"
  | "createNewTheme"
  | "renameTheme"
  | "togglePinTheme"
>

export const createThemeCrudSlice: StateCreator<
  BroadcastState,
  [],
  [],
  ThemeCrudSlice
> = (set, get) => ({
  themes: [...BUILTIN_THEMES],
  defaultThemeId: BUILTIN_THEMES[0].id,

  loadThemes: () => {
    set({ themes: [...BUILTIN_THEMES] })
  },
  saveTheme: (theme) =>
    set((s) => ({ themes: libraryCrud.upsertById(s.themes, theme) })),
  setDefaultTheme: (id) => {
    if (!get().themes.some((t) => t.id === id)) return
    set({ defaultThemeId: id })
    // A default that isn't shown is meaningless — apply it to the main output.
    get().setActiveTheme(id)
  },
  deleteTheme: (id) =>
    set((s) => ({
      themes: libraryCrud.removeCustomById(s.themes, id),
      // Deleting the default falls back to the first built-in.
      defaultThemeId:
        s.defaultThemeId === id
          ? (BUILTIN_THEMES[0]?.id ?? null)
          : s.defaultThemeId,
    })),
  duplicateTheme: (id) => {
    const source = get().themes.find((t) => t.id === id)
    if (!source) return
    const newTheme = libraryCrud.duplicateItem(
      source,
      crypto.randomUUID(),
      Date.now()
    )
    set((s) => ({ themes: [...s.themes, newTheme] }))
  },
  createNewTheme: () => {
    const source = BUILTIN_THEMES[0]
    const newTheme: BroadcastTheme = {
      ...source,
      id: crypto.randomUUID(),
      name: "Untitled Theme",
      category: "general",
      builtin: false,
      pinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      elements: [],
      layerOrder: ["textArea", "verse", "reference"],
      verseText: {
        ...source.verseText,
        fontSize: 48,
      },
      background: {
        type: "solid",
        color: "#000000",
        gradient: null,
        image: null,
        video: null,
      },
    }
    set((s) => ({ themes: [...s.themes, newTheme] }))
    get().startEditing(newTheme.id)
  },
  renameTheme: (id, name) =>
    set((s) => ({
      themes: libraryCrud.renameCustom(s.themes, id, name, Date.now()),
      draftTheme:
        s.draftTheme?.id === id
          ? { ...s.draftTheme, name, updatedAt: Date.now() }
          : s.draftTheme,
    })),
  togglePinTheme: (id) =>
    set((s) => ({
      themes: libraryCrud.togglePinById(s.themes, id, Date.now()),
    })),
})
