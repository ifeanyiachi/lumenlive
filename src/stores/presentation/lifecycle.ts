import type { StateCreator } from "zustand"
import type { Presentation } from "@/types/slide"
import { createDefaultPresentation } from "@/lib/slide-defaults"
import * as catalog from "@/lib/presentation/presentation-mutations"
import { themeToSlide, type ThemeIdentity } from "@/lib/theme/render"
import { useThemesStore } from "@/stores/themes"
import { resetHistory, pushUndo } from "./internals"
import type { PresentationState } from "./types"

/**
 * Editor lifecycle and theming: opening a draft (existing deck, brand-new deck,
 * or a typed `Theme`), saving/discarding it, and baking a theme onto the active
 * slide or the whole deck. Owns `editingPresentationId`, `draftPresentation`,
 * and `typedThemeSession`. Opening a draft resets the shared undo history.
 */
export type LifecycleSlice = Pick<
  PresentationState,
  | "editingPresentationId"
  | "draftPresentation"
  | "typedThemeSession"
  | "startEditing"
  | "startEditingNewPresentation"
  | "saveDraft"
  | "discardDraft"
  | "startEditingTheme"
  | "applyThemeToSlide"
  | "applyThemeToPresentation"
>

export const createLifecycleSlice: StateCreator<
  PresentationState,
  [],
  [],
  LifecycleSlice
> = (set, get) => ({
  editingPresentationId: null,
  draftPresentation: null,
  typedThemeSession: null,

  startEditing: (id) => {
    const p = get().presentations.find((p) => p.id === id)
    if (!p) return
    resetHistory()
    const draft: Presentation = structuredClone(p)
    set({
      editingPresentationId: id,
      draftPresentation: draft,
      activeSlideIndex: 0,
      selectedElementId: draft.slides[0]?.elements[0]?.id ?? null,
      typedThemeSession: null,
    })
  },

  startEditingNewPresentation: (name) => {
    resetHistory()
    // Open the editor on a fresh draft that is NOT yet in the library — it's
    // only persisted when the user hits Save (saveDraft appends it). Cancel
    // leaves the library untouched.
    const draft = createDefaultPresentation(name)
    set({
      editingPresentationId: draft.id,
      draftPresentation: draft,
      activeSlideIndex: 0,
      selectedElementId: draft.slides[0]?.elements[0]?.id ?? null,
      typedThemeSession: null,
    })
  },

  saveDraft: () =>
    set((s) => {
      // Type-first theme session (themeredo.md, Phase 3): saving is driven by the
      // Theme Designer, which projects the draft back into a `Theme` and writes to
      // `useThemesStore`. Never fall through to the deck path — the draft's
      // `__theme__` id isn't a library presentation and must not be appended.
      if (s.typedThemeSession) return s
      if (!s.draftPresentation || !s.editingPresentationId) return s
      const updated = { ...s.draftPresentation, updatedAt: Date.now() }
      // A brand-new deck (opened via startEditingNewPresentation) isn't in the
      // library yet — append it; an existing deck is replaced in place.
      const exists = s.presentations.some(
        (p) => p.id === s.editingPresentationId
      )
      return {
        presentations: exists
          ? s.presentations.map((p) =>
              p.id === s.editingPresentationId ? updated : p
            )
          : [...s.presentations, updated],
        draftPresentation: updated,
      }
    }),

  discardDraft: () =>
    set({
      editingPresentationId: null,
      draftPresentation: null,
      activeSlideIndex: 0,
      selectedElementId: null,
      typedThemeSession: null,
    }),

  startEditingTheme: (theme, isNew) => {
    resetHistory()
    // A theme is a styled single slide; project it into a one-slide draft the
    // slide editor can operate on. Element ids are minted deterministically off
    // the theme id (not `crypto`), so the same theme always opens identically.
    let n = 0
    const slide = themeToSlide(theme, () => `${theme.id}-el-${n++}`, Date.now())
    const draft: Presentation = {
      id: `__theme__${theme.id}`,
      name: theme.name,
      slides: [slide],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const identity: ThemeIdentity = {
      id: theme.id,
      type: theme.type,
      name: theme.name,
      pinned: theme.pinned,
      createdAt: theme.createdAt,
      resolution: theme.resolution,
    }
    set({
      editingPresentationId: draft.id,
      draftPresentation: draft,
      activeSlideIndex: 0,
      // Start with nothing selected so the type-specific theme panel shows first.
      selectedElementId: null,
      typedThemeSession: { identity, isNew },
    })
  },

  applyThemeToSlide: (themeId) => {
    const s = get()
    if (!s.draftPresentation) return
    // Bake the theme's background + typography onto the active slide, resolving
    // against the typed theme store (built-ins + customs). See presentation-mutations.
    const next = catalog.applyThemeToSlideAt(
      s.draftPresentation,
      s.activeSlideIndex,
      themeId,
      Date.now(),
      useThemesStore.getState().allThemes()
    )
    if (!next) return
    pushUndo(s.draftPresentation)
    set({ draftPresentation: next })
  },

  applyThemeToPresentation: (themeId) => {
    const s = get()
    if (!s.draftPresentation) return
    const next = catalog.applyThemeToDeck(
      s.draftPresentation,
      themeId,
      Date.now(),
      useThemesStore.getState().allThemes()
    )
    if (!next) return
    pushUndo(s.draftPresentation)
    set({ draftPresentation: next })
  },
})
