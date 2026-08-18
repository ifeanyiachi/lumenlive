import { createDraftSlideTheme } from "@/lib/theme"
import { usePresentationStore } from "@/stores/presentation-store"
import type { SlideTheme } from "@/types/slide"

const uuid = () => crypto.randomUUID()

/**
 * Song themes are authored in the slide editor, which the Theme Designer now
 * embeds in place (Phase 4 editor shell) — so the designer stays open and the
 * theme list remains visible on the left while editing. Nothing is persisted
 * here; the theme is only saved to the custom collection when the user hits
 * Save in the editor (editing a built-in forks it to a custom copy on save).
 */
export function editSlideTheme(theme: SlideTheme) {
  usePresentationStore.getState().startEditingSlideTheme(theme, false)
}

/** Duplicate a song theme into an editable copy and open it (saved on Save). */
export function duplicateSlideThemeForEdit(theme: SlideTheme) {
  const copy: SlideTheme = {
    ...structuredClone(theme),
    id: uuid(),
    name: `${theme.name} Copy`,
    builtin: false,
  }
  usePresentationStore.getState().startEditingSlideTheme(copy, true)
}

/** Open a fresh song theme in the slide editor (saved on Save). */
export function createAndEditSongTheme() {
  const { theme } = createDraftSlideTheme(
    { id: uuid(), name: "New Song Theme" },
    uuid
  )
  usePresentationStore.getState().startEditingSlideTheme(theme, true)
}
