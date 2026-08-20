import { beforeEach, describe, expect, it, vi } from "vitest"

// The store imports the persistence adapter, which loads the Tauri plugin-store
// at module load. Mock it so the store imports without a Tauri runtime.
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
  const { createThemeFromTemplate } = await import("@/lib/theme/templates")
  return { store: usePresentationStore, createThemeFromTemplate }
}

describe("presentation-store — type-first theme editing (Phase 3)", () => {
  beforeEach(() => vi.resetModules())

  it("startEditingTheme opens a single-slide draft carrying the theme identity", async () => {
    const { store, createThemeFromTemplate } = await freshStore()
    const theme = createThemeFromTemplate("countdown", () => "t-cd", 100)
    store.getState().startEditingTheme(theme, true)
    const s = store.getState()

    expect(s.typedThemeSession).toEqual({
      identity: {
        id: "t-cd",
        type: "countdown",
        name: theme.name,
        pinned: false,
        createdAt: 100,
        resolution: theme.resolution,
      },
      isNew: true,
    })
    expect(s.editingPresentationId).toBe("__theme__t-cd")
    expect(s.draftPresentation?.slides).toHaveLength(1)
    // The timer placeholder projected into the editable slide.
    expect(
      s.draftPresentation?.slides[0].elements.some((e) => e.type === "timer")
    ).toBe(true)
    // Nothing is selected, so the type-specific theme panel shows first.
    expect(s.selectedElementId).toBeNull()
    // The legacy SlideTheme session is mutually exclusive.
    expect(s.themeEditSession).toBeNull()
  })

  it("opening a type-first theme clears any legacy SlideTheme session and vice versa", async () => {
    const { store, createThemeFromTemplate } = await freshStore()
    const theme = createThemeFromTemplate("scripture", () => "t-sc", 0)

    store.getState().startEditingTheme(theme, false)
    expect(store.getState().typedThemeSession).not.toBeNull()

    // Opening a fresh deck clears the typed session.
    store.getState().startEditingNewPresentation("Deck")
    expect(store.getState().typedThemeSession).toBeNull()
  })

  it("discardDraft clears the typed theme session", async () => {
    const { store, createThemeFromTemplate } = await freshStore()
    const theme = createThemeFromTemplate("song", () => "t-sg", 0)
    store.getState().startEditingTheme(theme, true)
    store.getState().discardDraft()
    const s = store.getState()
    expect(s.typedThemeSession).toBeNull()
    expect(s.draftPresentation).toBeNull()
    expect(s.editingPresentationId).toBeNull()
  })

  it("edits to the draft round-trip back into a Theme via slideToTheme", async () => {
    const { store, createThemeFromTemplate } = await freshStore()
    const { slideToTheme } = await import("@/lib/theme/render")
    const theme = createThemeFromTemplate("scripture", () => "t-sc", 7)
    store.getState().startEditingTheme(theme, true)

    const el = store.getState().draftPresentation!.slides[0].elements[0]
    store.getState().updateDraftElement(el.id, { fontSize: 123 })

    const s = store.getState()
    const saved = slideToTheme(
      s.draftPresentation!.slides[0],
      s.typedThemeSession!.identity,
      999
    )
    expect(saved.id).toBe("t-sc")
    expect(saved.type).toBe("scripture")
    expect(saved.builtin).toBe(false)
    expect(saved.createdAt).toBe(7)
    expect(saved.updatedAt).toBe(999)
    const scripture = saved.elements.find((e) => e.type === "scripture") as {
      fontSize: number
    }
    expect(scripture.fontSize).toBe(123)
  })
})
