import type {
  Slide,
  SlideElement,
  Presentation,
  SlideTheme,
} from "@/types/slide"
import type { Theme } from "@/types/theme"
import type { ThemeIdentity } from "@/lib/theme/render"

export interface PresentationState {
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

  // ── Type-first themes (themeredo.md, Phase 3) ──
  /**
   * Non-null while the slide editor is authoring a type-first {@link Theme}
   * (scripture/song/countdown/…) rather than a deck or a legacy song theme.
   * Carries the theme's intrinsic identity so `slideToTheme` can fold the edited
   * slide back onto it at Save (Save is driven by the Theme Designer, which
   * writes to `useThemesStore`). `isNew` distinguishes a just-created draft.
   */
  typedThemeSession: { identity: ThemeIdentity; isNew: boolean } | null
  /** Open the slide editor on a type-first theme; drives the type-specific panel. */
  startEditingTheme: (theme: Theme, isNew: boolean) => void

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
  addTimerElement: () => void

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

  applyThemeToSlide: (themeId: string) => void
  applyThemeToPresentation: (themeId: string) => void

  exportPresentation: (id: string) => string | null
  importPresentation: (json: string) => string | null
  importParsedPresentation: (presentation: Presentation) => string
}
