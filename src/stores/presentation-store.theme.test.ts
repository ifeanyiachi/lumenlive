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
  const { BUILTIN_SLIDE_THEMES } = await import("@/lib/slide-themes")
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

    // Editing a BUILT-IN theme forks it to a new custom one on save.
    store.getState().startEditingSlideTheme(songTheme, false)
    const el = store.getState().draftPresentation!.slides[0].elements[0]
    store.getState().updateDraftElement(el.id, { color: "#ff0000" })
    store.getState().saveDraft()

    const s = store.getState()
    // No library entry was created.
    expect(s.presentations.length).toBe(before)
    // Exactly one custom theme — a fork with a NEW id (the built-in is untouched).
    expect(s.customSlideThemes).toHaveLength(1)
    const saved = s.customSlideThemes[0]
    expect(saved.id).not.toBe(songTheme.id)
    expect(saved.builtin).toBe(false)
    expect(saved.name).toBe(`${songTheme.name} (Custom)`)
    const content = saved.variants.find((v) => v.layout === "content-only")!
    const firstEl = content.elements[0] as { color?: string }
    expect(firstEl.color).toBe("#ff0000")
    // The session now targets the fork, so further saves update it in place.
    expect(s.themeEditSession).toEqual({ themeId: saved.id, isNew: false })
    expect(s.editingPresentationId).toBe(`__theme__${saved.id}`)
    // The blank variant is derived (same bg, no elements).
    expect(saved.variants.map((v) => v.layout)).toEqual([
      "content-only",
      "blank",
    ])

    // A second save updates the fork in place (no second custom theme).
    store.getState().saveDraft()
    expect(store.getState().customSlideThemes).toHaveLength(1)
  })

  it("editing a CUSTOM theme updates it in place (no fork)", async () => {
    const { store } = await freshStore()
    const custom = {
      id: "c-inplace",
      name: "Mine",
      category: "song" as const,
      builtin: false,
      variants: [
        {
          layout: "content-only" as const,
          background: { type: "solid" as const, color: "#111111" },
          elements: [],
        },
        {
          layout: "blank" as const,
          background: { type: "solid" as const, color: "#111111" },
          elements: [],
        },
      ],
    }
    store.getState().saveCustomSlideTheme(custom)
    store.getState().startEditingSlideTheme(custom, false)
    store.getState().saveDraft()
    const s = store.getState()
    expect(s.customSlideThemes).toHaveLength(1)
    expect(s.customSlideThemes[0].id).toBe("c-inplace")
    expect(s.themeEditSession?.themeId).toBe("c-inplace")
  })

  it("startEditingNewPresentation opens a draft that persists only on save", async () => {
    const { store } = await freshStore()
    const before = store.getState().presentations.length

    store.getState().startEditingNewPresentation("Fresh Deck")
    expect(store.getState().themeEditSession).toBeNull()
    expect(store.getState().draftPresentation).toBeTruthy()
    // Not in the library yet.
    expect(store.getState().presentations.length).toBe(before)

    // Discarding leaves the library untouched.
    store.getState().discardDraft()
    expect(store.getState().presentations.length).toBe(before)

    // Editing again and saving appends exactly one deck.
    store.getState().startEditingNewPresentation("Fresh Deck")
    const draftId = store.getState().editingPresentationId
    store.getState().saveDraft()
    expect(store.getState().presentations.length).toBe(before + 1)
    expect(store.getState().presentations.some((p) => p.id === draftId)).toBe(
      true
    )
    // Saving again does not create a duplicate.
    store.getState().saveDraft()
    expect(store.getState().presentations.length).toBe(before + 1)
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
    const custom = {
      ...structuredClone(songTheme),
      id: "c-edit",
      builtin: false,
    }
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
