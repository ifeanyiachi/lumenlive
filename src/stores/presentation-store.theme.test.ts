import { beforeEach, describe, expect, it, vi } from "vitest"

// The store imports the persistence adapter, which imports the Tauri plugin-store
// at module load. Mock it so the store can be imported without a Tauri runtime.
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(() =>
    Promise.resolve({
      get: vi.fn(() => Promise.resolve(undefined)),
      set: vi.fn(() => Promise.resolve()),
      save: vi.fn(() => Promise.resolve()),
      delete: vi.fn(() => Promise.resolve()),
    })
  ),
}))

async function freshStore() {
  vi.resetModules()
  const { usePresentationStore } = await import("./presentation-store")
  const { BUILTIN_SLIDE_THEMES } = await import("@/types/slide")
  const songTheme = BUILTIN_SLIDE_THEMES.find((t) => t.category === "song")!
  return { store: usePresentationStore, songTheme }
}

describe("presentation-store — song theme editing", () => {
  beforeEach(() => vi.resetModules())

  it("startEditingSlideTheme opens a single-slide draft in theme mode", async () => {
    const { store, songTheme } = await freshStore()
    store.getState().startEditingSlideTheme(songTheme, false)
    const s = store.getState()
    expect(s.themeEditSession).toEqual({ themeId: songTheme.id, isNew: false })
    expect(s.editingPresentationId).toBe(`__theme__${songTheme.id}`)
    expect(s.draftPresentation?.slides).toHaveLength(1)
  })

  it("saveDraft in theme mode upserts a custom SlideTheme, not a presentation", async () => {
    const { store, songTheme } = await freshStore()
    const before = store.getState().presentations.length

    store.getState().startEditingSlideTheme(songTheme, true)
    const el = store.getState().draftPresentation!.slides[0].elements[0]
    store.getState().updateDraftElement(el.id, { color: "#ff0000" })
    store.getState().saveDraft()

    const s = store.getState()
    // No library entry was created.
    expect(s.presentations.length).toBe(before)
    // A custom theme with the edited color was upserted.
    const saved = s.customSlideThemes.find((t) => t.id === songTheme.id)
    expect(saved).toBeTruthy()
    expect(saved!.builtin).toBe(false)
    const content = saved!.variants.find((v) => v.layout === "content-only")!
    const firstEl = content.elements[0] as { color?: string }
    expect(firstEl.color).toBe("#ff0000")
    // isNew flips off after the first save.
    expect(s.themeEditSession).toEqual({ themeId: songTheme.id, isNew: false })
    // The blank variant is derived (same bg, no elements).
    expect(saved!.variants.map((v) => v.layout)).toEqual([
      "content-only",
      "blank",
    ])
  })

  it("discardDraft clears the theme session", async () => {
    const { store, songTheme } = await freshStore()
    store.getState().startEditingSlideTheme(songTheme, false)
    store.getState().discardDraft()
    const s = store.getState()
    expect(s.themeEditSession).toBeNull()
    expect(s.editingPresentationId).toBeNull()
    expect(s.draftPresentation).toBeNull()
  })

  it("CRUD: save, rename, delete custom slide themes", async () => {
    const { store } = await freshStore()
    const theme = {
      id: "c1",
      name: "Mine",
      category: "song" as const,
      builtin: false,
      variants: [],
    }
    store.getState().saveCustomSlideTheme(theme)
    expect(store.getState().customSlideThemes).toHaveLength(1)

    // Upsert (same id) replaces, not appends.
    store.getState().saveCustomSlideTheme({ ...theme, name: "Mine v2" })
    expect(store.getState().customSlideThemes).toHaveLength(1)

    store.getState().renameCustomSlideTheme("c1", "Renamed")
    expect(store.getState().customSlideThemes[0].name).toBe("Renamed")

    store.getState().deleteCustomSlideTheme("c1")
    expect(store.getState().customSlideThemes).toHaveLength(0)
  })

  it("deleting the theme being edited closes the editor", async () => {
    const { store, songTheme } = await freshStore()
    const custom = { ...structuredClone(songTheme), id: "c-edit", builtin: false }
    store.getState().saveCustomSlideTheme(custom)
    store.getState().startEditingSlideTheme(custom, false)
    store.getState().deleteCustomSlideTheme("c-edit")
    const s = store.getState()
    expect(s.themeEditSession).toBeNull()
    expect(s.draftPresentation).toBeNull()
  })

  it("applies a CUSTOM slide theme to a deck (Phase 4 follow-up)", async () => {
    const { store } = await freshStore()
    store.getState().saveCustomSlideTheme({
      id: "c-apply",
      name: "Applied",
      category: "song",
      builtin: false,
      variants: [
        {
          layout: "content-only",
          background: { type: "solid", color: "#0f0f0f" },
          elements: [],
        },
      ],
    })
    const id = store.getState().createPresentation("Deck")
    store.getState().startEditing(id)
    store.getState().applyThemeToPresentation("c-apply")
    const draft = store.getState().draftPresentation!
    expect(
      draft.slides.every(
        (sl) => (sl.background as { color?: string }).color === "#0f0f0f"
      )
    ).toBe(true)
  })
})
