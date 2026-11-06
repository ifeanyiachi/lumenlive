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
  return { store: usePresentationStore }
}

describe("presentation-store — deck theming (bake-in, 3C)", () => {
  beforeEach(() => vi.resetModules())

  it("bakes a typed Theme's background onto every slide of a deck", async () => {
    const { store } = await freshStore()
    const { BUILTIN_THEMES } = await import("@/lib/theme/builtins")
    const hymnal = BUILTIN_THEMES.find((t) => t.id === "builtin-song-hymnal")!
    const id = store.getState().createPresentation("Deck")
    store.getState().startEditing(id)
    store.getState().applyThemeToPresentation(hymnal.id)
    const draft = store.getState().draftPresentation!
    expect(draft.slides.length).toBeGreaterThan(0)
    for (const sl of draft.slides) {
      expect(sl.background).toEqual(hymnal.background)
    }
  })

  it("applies a theme to only the active slide via applyThemeToSlide", async () => {
    const { store } = await freshStore()
    const { BUILTIN_THEMES } = await import("@/lib/theme/builtins")
    const aurora = BUILTIN_THEMES.find((t) => t.id === "builtin-song-aurora")!
    const id = store.getState().createPresentation("Deck")
    store.getState().startEditing(id)
    store.getState().addSlide()
    store.getState().setActiveSlideIndex(0)
    const before = store.getState().draftPresentation!.slides[1].background
    store.getState().applyThemeToSlide(aurora.id)
    const draft = store.getState().draftPresentation!
    expect(draft.slides[0].background).toEqual(aurora.background)
    // The other slide is untouched.
    expect(draft.slides[1].background).toEqual(before)
  })
})
