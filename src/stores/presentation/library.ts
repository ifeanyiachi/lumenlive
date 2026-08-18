import type { StateCreator } from "zustand"
import { createDefaultPresentation } from "@/lib/slide-defaults"
import * as catalog from "@/lib/presentation/presentation-mutations"
import { newId } from "./internals"
import type { PresentationState } from "./types"

/**
 * The deck library: create / delete / duplicate / rename presentations, the
 * search query and library selection, the read-only getters, and JSON
 * import/export. Owns `presentations`, `searchQuery`, and
 * `selectedPresentationId`. Pure array/JSON transforms are delegated to
 * `lib/presentation/presentation-mutations`.
 */
export type LibrarySlice = Pick<
  PresentationState,
  | "presentations"
  | "searchQuery"
  | "selectedPresentationId"
  | "createPresentation"
  | "deletePresentation"
  | "duplicatePresentation"
  | "renamePresentation"
  | "setSearchQuery"
  | "setSelectedPresentation"
  | "getPresentationById"
  | "getSlide"
  | "exportPresentation"
  | "importPresentation"
  | "importParsedPresentation"
>

export const createLibrarySlice: StateCreator<
  PresentationState,
  [],
  [],
  LibrarySlice
> = (set, get) => ({
  presentations: [],
  searchQuery: "",
  selectedPresentationId: null,

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

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setSelectedPresentation: (selectedPresentationId) =>
    set({ selectedPresentationId }),

  getPresentationById: (id) => get().presentations.find((p) => p.id === id),

  getSlide: (presentationId, slideIndex) => {
    const p = get().presentations.find((pr) => pr.id === presentationId)
    return p?.slides[slideIndex]
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
})
