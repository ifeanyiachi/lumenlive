import type { StateCreator } from "zustand"
import type { Presentation } from "@/types/slide"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import { createDefaultPresentation } from "@/lib/slide-defaults"
import * as slides from "@/lib/presentation/slide-mutations"
import * as catalog from "@/lib/presentation/presentation-mutations"
import {
  slideThemeToEditableSlide,
  editableSlideToSlideTheme,
} from "@/lib/theme/slide-theme-edit"
import { newId, resetHistory, pushUndo } from "./internals"
import type { PresentationState } from "./types"

/**
 * Editor lifecycle and theming: opening a draft (existing deck, brand-new deck,
 * or a song theme), saving/discarding it, the custom slide-theme CRUD, and
 * applying a theme to the active slide or the whole deck. Owns
 * `editingPresentationId`, `draftPresentation`, `customSlideThemes`, and
 * `themeEditSession`. Opening a draft resets the shared undo history.
 */
export type LifecycleSlice = Pick<
  PresentationState,
  | "editingPresentationId"
  | "draftPresentation"
  | "customSlideThemes"
  | "themeEditSession"
  | "startEditing"
  | "startEditingNewPresentation"
  | "saveDraft"
  | "discardDraft"
  | "saveCustomSlideTheme"
  | "deleteCustomSlideTheme"
  | "renameCustomSlideTheme"
  | "startEditingSlideTheme"
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
  customSlideThemes: [],
  themeEditSession: null,

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
      themeEditSession: null,
    })
  },

  saveDraft: () =>
    set((s) => {
      // Theme-authoring session: the draft's single slide becomes a custom
      // SlideTheme rather than a library presentation. Editing a *built-in*
      // theme forks it to a new custom one (built-ins live in code and stay
      // immutable), then keeps editing the fork — mirroring the verse designer.
      const session = s.themeEditSession
      if (session) {
        const slide = s.draftPresentation?.slides[0]
        if (!slide) return s
        const builtin = BUILTIN_SLIDE_THEMES.find(
          (t) => t.id === session.themeId
        )
        const targetId = builtin ? newId() : session.themeId
        const draftName = s.draftPresentation?.name ?? slide.name
        // Distinguish a fork from its built-in when the name wasn't changed.
        const name =
          builtin && draftName === builtin.name
            ? `${draftName} (Custom)`
            : draftName
        const theme = editableSlideToSlideTheme(slide, { id: targetId, name })
        const draftId = `__theme__${targetId}`
        return {
          customSlideThemes: s.customSlideThemes.some((t) => t.id === targetId)
            ? s.customSlideThemes.map((t) => (t.id === targetId ? theme : t))
            : [...s.customSlideThemes, theme],
          themeEditSession: { themeId: targetId, isNew: false },
          editingPresentationId: draftId,
          draftPresentation: s.draftPresentation
            ? {
                ...s.draftPresentation,
                id: draftId,
                name,
                updatedAt: Date.now(),
              }
            : s.draftPresentation,
        }
      }
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
      themeEditSession: null,
    }),

  saveCustomSlideTheme: (theme) =>
    set((s) => ({
      customSlideThemes: s.customSlideThemes.some((t) => t.id === theme.id)
        ? s.customSlideThemes.map((t) => (t.id === theme.id ? theme : t))
        : [...s.customSlideThemes, theme],
    })),

  deleteCustomSlideTheme: (id) =>
    set((s) => ({
      customSlideThemes: s.customSlideThemes.filter((t) => t.id !== id),
      // If the editor is open on the deleted theme, close it.
      ...(s.themeEditSession?.themeId === id
        ? {
            editingPresentationId: null,
            draftPresentation: null,
            themeEditSession: null,
          }
        : {}),
    })),

  renameCustomSlideTheme: (id, name) =>
    set((s) => ({
      customSlideThemes: s.customSlideThemes.map((t) =>
        t.id === id ? { ...t, name } : t
      ),
    })),

  startEditingSlideTheme: (theme, isNew) => {
    resetHistory()
    let n = 0
    const slide = slideThemeToEditableSlide(
      theme,
      () => `${theme.id}-el-${n++}`,
      Date.now()
    )
    const draft: Presentation = {
      id: `__theme__${theme.id}`,
      name: theme.name,
      slides: [slide],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set({
      editingPresentationId: draft.id,
      draftPresentation: draft,
      activeSlideIndex: 0,
      selectedElementId: slide.elements[0]?.id ?? null,
      themeEditSession: { themeId: theme.id, isNew },
    })
  },

  applyThemeToSlide: (themeId, variant) => {
    // Resolve against built-ins + the user's custom slide themes (Phase 3d/4).
    const content = catalog.resolveThemeSlideContent(themeId, variant, newId, [
      ...BUILTIN_SLIDE_THEMES,
      ...get().customSlideThemes,
    ])
    if (!content) return
    const s = get()
    if (!s.draftPresentation) return
    pushUndo(s.draftPresentation)
    set({
      draftPresentation: slides.updateSlideAt(
        s.draftPresentation,
        s.activeSlideIndex,
        {
          background: content.background,
          elements: content.elements,
        },
        Date.now()
      ),
      selectedElementId: content.elements[0]?.id ?? null,
    })
  },

  applyThemeToPresentation: (themeId) => {
    const s = get()
    if (!s.draftPresentation) return
    const next = catalog.applyThemeToAllSlides(
      s.draftPresentation,
      themeId,
      Date.now(),
      [...BUILTIN_SLIDE_THEMES, ...s.customSlideThemes]
    )
    if (!next) return
    pushUndo(s.draftPresentation)
    set({ draftPresentation: next })
  },
})
