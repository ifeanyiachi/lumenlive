import { create } from "zustand"
import type {
  Slide,
  SlideElement,
  Presentation,
  SlideTheme,
} from "@/types/slide"
import {
  BUILTIN_SLIDE_THEMES,
  createDefaultPresentation,
  createDefaultSlide,
  createDefaultTextElement,
  createDefaultImageElement,
  createDefaultScriptureElement,
  createDefaultShapeElement,
  createDefaultVideoElement,
} from "@/types/slide"
import type { SlideLayoutVariant } from "@/types/slide"
import * as history from "@/lib/presentation/history"
import * as slides from "@/lib/presentation/slide-mutations"
import * as catalog from "@/lib/presentation/presentation-mutations"
import {
  slideThemeToEditableSlide,
  editableSlideToSlideTheme,
} from "@/lib/theme/slide-theme-edit"
import {
  loadStoredPresentations,
  loadLegacySlidePresentations,
  savePresentations,
  loadStoredSlideThemes,
  saveSlideThemes,
} from "@/lib/presentation/persistence"

interface PresentationState {
  presentations: Presentation[]
  searchQuery: string
  selectedPresentationId: string | null

  editingPresentationId: string | null
  draftPresentation: Presentation | null
  activeSlideIndex: number
  selectedElementId: string | null
  /**
   * Id of the text element currently being edited inline on the canvas (via
   * double-click), or `null`. While set, the editor hides this element's baked
   * canvas text so the DOM overlay `<textarea>` is the sole visible copy.
   */
  editingTextElementId: string | null

  createPresentation: (name?: string) => string
  deletePresentation: (id: string) => void
  duplicatePresentation: (id: string) => void
  renamePresentation: (id: string, name: string) => void

  startEditing: (id: string) => void
  /** Open the editor on a new, unsaved draft deck (persisted only on save). */
  startEditingNewPresentation: (name?: string) => void
  saveDraft: () => void
  discardDraft: () => void

  // ── Custom slide/song themes (theme-unification-plan.md, Phase 3) ──
  /** User-authored song themes; built-ins live in code and aren't stored here. */
  customSlideThemes: SlideTheme[]
  /**
   * Non-null while the slide editor is authoring a song theme rather than a deck.
   * Redirects `saveDraft` to write a `SlideTheme` instead of a library entry.
   */
  themeEditSession: { themeId: string; isNew: boolean } | null
  saveCustomSlideTheme: (theme: SlideTheme) => void
  deleteCustomSlideTheme: (id: string) => void
  renameCustomSlideTheme: (id: string, name: string) => void
  /** Open the slide editor on a song theme (an existing custom, or a new/duplicate). */
  startEditingSlideTheme: (theme: SlideTheme, isNew: boolean) => void

  addSlide: () => void
  removeSlide: (index: number) => void
  duplicateSlide: (index: number) => void
  reorderSlide: (fromIndex: number, toIndex: number) => void
  setActiveSlideIndex: (index: number) => void

  updateDraftSlide: (updates: Partial<Slide>) => void
  updateDraftElement: (
    elementId: string,
    updates: Partial<SlideElement>
  ) => void
  updateDraftElementsBatch: (
    updatesById: Record<string, Partial<SlideElement>>
  ) => void
  beginTextEdit: (elementId: string) => void
  commitTextEdit: (elementId: string, text: string) => void
  cancelTextEdit: () => void
  addElement: () => void
  addImageElement: () => void
  addScriptureElement: () => void
  addShapeElement: () => void
  removeElement: (elementId: string) => void
  setSelectedElement: (id: string | null) => void
  reorderElement: (fromIndex: number, toIndex: number) => void
  moveElementToTop: (elementId: string) => void
  moveElementToBottom: (elementId: string) => void
  moveElementUp: (elementId: string) => void
  moveElementDown: (elementId: string) => void

  addVideoElement: () => void

  selectedElementIds: string[]
  toggleSelectElement: (id: string) => void
  clearMultiSelect: () => void
  removeSelectedElements: () => void
  updateSelectedElements: (updates: Partial<SlideElement>) => void

  undo: () => void
  redo: () => void

  setSearchQuery: (query: string) => void
  setSelectedPresentation: (id: string | null) => void

  getPresentationById: (id: string) => Presentation | undefined
  getSlide: (presentationId: string, slideIndex: number) => Slide | undefined

  applyThemeToSlide: (themeId: string, variant: SlideLayoutVariant) => void
  applyThemeToPresentation: (themeId: string) => void

  exportPresentation: (id: string) => string | null
  importPresentation: (json: string) => string | null
  importParsedPresentation: (presentation: Presentation) => string
}

/** Fresh id generator, wrapped so `crypto` stays the receiver. */
const newId = () => crypto.randomUUID()

// Undo/redo snapshots live at module scope (shared by the singleton store). The
// stack mechanics are delegated to the pure `history` helpers.
let undoStack: Presentation[] = []
let redoStack: Presentation[] = []

// Continuous edits (color pickers, opacity/size sliders, transition-duration
// spinners) fire `updateDraftSlide` many times per second. Snapshotting every
// tick both churns memory and floods the 50-entry stack so one drag wipes the
// whole history. Coalesce those into a single snapshot per gesture by only
// pushing once per debounce window — the same pattern the broadcast editor uses.
let lastUndoPush = 0
const UNDO_DEBOUNCE_MS = 300

function pushUndo(current: Presentation | null) {
  if (!current) return
  undoStack = history.pushSnapshot(undoStack, current)
  redoStack = []
}

/** Snapshot for undo, but at most once per {@link UNDO_DEBOUNCE_MS} window. */
function pushUndoDebounced(current: Presentation | null) {
  const now = Date.now()
  if (now - lastUndoPush <= UNDO_DEBOUNCE_MS) return
  pushUndo(current)
  lastUndoPush = now
}

export const usePresentationStore = create<PresentationState>((set, get) => ({
  presentations: [],
  searchQuery: "",
  selectedPresentationId: null,

  editingPresentationId: null,
  draftPresentation: null,
  customSlideThemes: [],
  themeEditSession: null,
  activeSlideIndex: 0,
  selectedElementId: null,
  editingTextElementId: null,
  selectedElementIds: [],

  createPresentation: (name) => {
    const p = createDefaultPresentation(name)
    set((s) => ({ presentations: [...s.presentations, p] }))
    return p.id
  },

  deletePresentation: (id) =>
    set((s) => ({
      presentations: s.presentations.filter((p) => p.id !== id),
      selectedPresentationId:
        s.selectedPresentationId === id ? null : s.selectedPresentationId,
      editingPresentationId:
        s.editingPresentationId === id ? null : s.editingPresentationId,
      draftPresentation:
        s.editingPresentationId === id ? null : s.draftPresentation,
    })),

  duplicatePresentation: (id) => {
    const original = get().presentations.find((p) => p.id === id)
    if (!original) return
    const dup = catalog.duplicatePresentation(original, newId, Date.now())
    set((s) => ({ presentations: [...s.presentations, dup] }))
  },

  renamePresentation: (id, name) =>
    set((s) => ({
      presentations: s.presentations.map((p) =>
        p.id === id ? { ...p, name, updatedAt: Date.now() } : p
      ),
    })),

  startEditing: (id) => {
    const p = get().presentations.find((p) => p.id === id)
    if (!p) return
    undoStack = []
    redoStack = []
    lastUndoPush = 0
    const draft: Presentation = structuredClone(p)
    set({
      editingPresentationId: id,
      draftPresentation: draft,
      activeSlideIndex: 0,
      selectedElementId: draft.slides[0]?.elements[0]?.id ?? null,
    })
  },

  startEditingNewPresentation: (name) => {
    undoStack = []
    redoStack = []
    lastUndoPush = 0
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
    undoStack = []
    redoStack = []
    lastUndoPush = 0
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

  addSlide: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const slide = createDefaultSlide()
      const newIndex = s.draftPresentation.slides.length
      return {
        draftPresentation: slides.appendSlide(
          s.draftPresentation,
          slide,
          Date.now()
        ),
        activeSlideIndex: newIndex,
        selectedElementId: slide.elements[0]?.id ?? null,
      }
    }),

  removeSlide: (index) =>
    set((s) => {
      if (!s.draftPresentation || s.draftPresentation.slides.length <= 1)
        return s
      const draft = slides.removeSlideAt(s.draftPresentation, index, Date.now())
      const newIndex = Math.min(s.activeSlideIndex, draft.slides.length - 1)
      return {
        draftPresentation: draft,
        activeSlideIndex: newIndex,
        selectedElementId: draft.slides[newIndex]?.elements[0]?.id ?? null,
      }
    }),

  duplicateSlide: (index) =>
    set((s) => {
      if (!s.draftPresentation) return s
      const draft = slides.duplicateSlideAt(
        s.draftPresentation,
        index,
        newId,
        Date.now()
      )
      if (!draft) return s
      const dup = draft.slides[index + 1]
      return {
        draftPresentation: draft,
        activeSlideIndex: index + 1,
        selectedElementId: dup.elements[0]?.id ?? null,
      }
    }),

  reorderSlide: (fromIndex, toIndex) =>
    set((s) => {
      if (!s.draftPresentation) return s
      return {
        draftPresentation: slides.reorderSlideAt(
          s.draftPresentation,
          fromIndex,
          toIndex,
          Date.now()
        ),
        activeSlideIndex: toIndex,
      }
    }),

  setActiveSlideIndex: (index) =>
    set((s) => {
      const slide = s.draftPresentation?.slides[index]
      return {
        activeSlideIndex: index,
        selectedElementId: slide?.elements[0]?.id ?? null,
        editingTextElementId: null,
      }
    }),

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

  undo: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const step = history.undo(s.draftPresentation, undoStack, redoStack)
      if (!step) return s
      undoStack = step.undoStack
      redoStack = step.redoStack
      return {
        draftPresentation: step.current,
        selectedElementId:
          step.current.slides[s.activeSlideIndex]?.elements[0]?.id ?? null,
      }
    }),

  redo: () =>
    set((s) => {
      if (!s.draftPresentation) return s
      const step = history.redo(s.draftPresentation, undoStack, redoStack)
      if (!step) return s
      undoStack = step.undoStack
      redoStack = step.redoStack
      return {
        draftPresentation: step.current,
        selectedElementId:
          step.current.slides[s.activeSlideIndex]?.elements[0]?.id ?? null,
      }
    }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setSelectedPresentation: (selectedPresentationId) =>
    set({ selectedPresentationId }),

  getPresentationById: (id) => get().presentations.find((p) => p.id === id),

  getSlide: (presentationId, slideIndex) => {
    const p = get().presentations.find((pr) => pr.id === presentationId)
    return p?.slides[slideIndex]
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

  exportPresentation: (id) => {
    const p = get().presentations.find((pr) => pr.id === id)
    if (!p) return null
    return catalog.exportToJson(p)
  },

  importPresentation: (json) => {
    const imported = catalog.importFromJson(json, newId, Date.now())
    if (!imported) return null
    set((s) => ({ presentations: [...s.presentations, imported] }))
    return imported.id
  },

  importParsedPresentation: (presentation) => {
    // Already a fully-formed Presentation (e.g. from the .pptx parser). Append
    // as-is; the parser is responsible for fresh IDs. Persistence happens
    // automatically via the store subscriber.
    set((s) => ({ presentations: [...s.presentations, presentation] }))
    return presentation.id
  },
}))

// ── Persistence wiring ──
// All plugin-store I/O lives in src/lib/presentation/persistence.ts; this just
// bridges load → state on startup and state → save (debounced) thereafter.

let hydrationPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
let themeSaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingThemeSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

export function hydratePresentations(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const stored = await loadStoredPresentations()
      if (stored) usePresentationStore.setState({ presentations: stored })

      const legacy = await loadLegacySlidePresentations()
      if (legacy) {
        usePresentationStore.setState((s) => ({
          presentations: [...s.presentations, ...legacy],
        }))
      }

      const storedThemes = await loadStoredSlideThemes()
      if (storedThemes)
        usePresentationStore.setState({ customSlideThemes: storedThemes })
    } catch {
      console.warn(
        "[presentations] Failed to load persisted presentations, starting empty"
      )
    }

    // Register autosave regardless of load outcome: a load failure must not
    // leave the session silently without persistence for the user's new work.
    usePresentationStore.subscribe((state, prevState) => {
      if (state.presentations !== prevState.presentations) {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          pendingSave = pendingSave.then(() =>
            savePresentations(usePresentationStore.getState().presentations)
          )
        }, SAVE_DEBOUNCE_MS)
      }
      if (state.customSlideThemes !== prevState.customSlideThemes) {
        if (themeSaveTimer) clearTimeout(themeSaveTimer)
        themeSaveTimer = setTimeout(() => {
          themeSaveTimer = null
          pendingThemeSave = pendingThemeSave.then(() =>
            saveSlideThemes(usePresentationStore.getState().customSlideThemes)
          )
        }, SAVE_DEBOUNCE_MS)
      }
    })
  })()
  return hydrationPromise
}
