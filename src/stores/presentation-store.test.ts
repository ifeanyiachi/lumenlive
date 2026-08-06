import { beforeEach, describe, expect, it, vi } from "vitest"

// The store module transitively imports the tauri plugin-store adapter; stub it
// so importing the store never touches native Tauri APIs.
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => {}),
    save: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  })),
}))

async function freshStore() {
  vi.resetModules()
  const mod = await import("./presentation-store")
  return mod.usePresentationStore
}

describe("presentation store — deck & slide flow", () => {
  beforeEach(() => vi.resetModules())

  it("create, duplicate, and start editing a presentation", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Sermon")
    expect(useStore.getState().presentations).toHaveLength(1)

    useStore.getState().duplicatePresentation(id)
    const [, dup] = useStore.getState().presentations
    expect(dup.name).toBe("Sermon (Copy)")
    expect(dup.id).not.toBe(id)

    useStore.getState().startEditing(id)
    expect(useStore.getState().draftPresentation?.id).toBe(id)
  })

  it("addSlide selects the new slide; removeSlide guards the last slide", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Deck")
    useStore.getState().startEditing(id)

    useStore.getState().addSlide()
    expect(useStore.getState().draftPresentation!.slides).toHaveLength(2)
    expect(useStore.getState().activeSlideIndex).toBe(1)

    useStore.getState().removeSlide(1)
    expect(useStore.getState().draftPresentation!.slides).toHaveLength(1)

    // Cannot remove the final remaining slide.
    useStore.getState().removeSlide(0)
    expect(useStore.getState().draftPresentation!.slides).toHaveLength(1)
  })

  it("duplicateSlide inserts a re-id'd copy after the source", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Deck")
    useStore.getState().startEditing(id)
    const srcId = useStore.getState().draftPresentation!.slides[0].id

    useStore.getState().duplicateSlide(0)
    const deck = useStore.getState().draftPresentation!
    expect(deck.slides).toHaveLength(2)
    expect(deck.slides[1].id).not.toBe(srcId)
    expect(useStore.getState().activeSlideIndex).toBe(1)
  })

  it("adds an element and undo/redo restores it", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Deck")
    useStore.getState().startEditing(id)
    const before =
      useStore.getState().draftPresentation!.slides[0].elements.length

    useStore.getState().addElement()
    const added = useStore.getState()
    expect(added.draftPresentation!.slides[0].elements).toHaveLength(before + 1)
    const newElId = added.selectedElementId
    expect(
      added.draftPresentation!.slides[0].elements.some((e) => e.id === newElId)
    ).toBe(true)

    useStore.getState().undo()
    expect(
      useStore.getState().draftPresentation!.slides[0].elements
    ).toHaveLength(before)

    useStore.getState().redo()
    expect(
      useStore.getState().draftPresentation!.slides[0].elements
    ).toHaveLength(before + 1)
  })

  it("reorders element stacking and no-ops at the boundary", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Deck")
    useStore.getState().startEditing(id)
    useStore.getState().addElement()
    useStore.getState().addElement()
    const els = useStore.getState().draftPresentation!.slides[0].elements
    const firstId = els[0].id

    useStore.getState().moveElementToTop(firstId)
    const after = useStore.getState().draftPresentation!.slides[0].elements
    expect(after[after.length - 1].id).toBe(firstId)

    // Already last → no-op (no throw, array unchanged in order).
    const snapshot = useStore
      .getState()
      .draftPresentation!.slides[0].elements.map((e) => e.id)
    useStore.getState().moveElementToTop(firstId)
    expect(
      useStore.getState().draftPresentation!.slides[0].elements.map((e) => e.id)
    ).toEqual(snapshot)
  })

  it("removeElement reselects when the removed element was selected", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Deck")
    useStore.getState().startEditing(id)
    useStore.getState().addElement()
    const selId = useStore.getState().selectedElementId!

    useStore.getState().removeElement(selId)
    const after = useStore.getState()
    expect(
      after.draftPresentation!.slides[0].elements.some((e) => e.id === selId)
    ).toBe(false)
    expect(after.selectedElementId).not.toBe(selId)
  })

  it("updateDraftElementsBatch applies a distinct patch to each element in one commit", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Deck")
    useStore.getState().startEditing(id)
    useStore.getState().addElement()
    const aId = useStore.getState().selectedElementId!
    useStore.getState().addElement()
    const bId = useStore.getState().selectedElementId!

    const before = useStore.getState().draftPresentation
    useStore
      .getState()
      .updateDraftElementsBatch({ [aId]: { x: 5 }, [bId]: { y: 7 } })
    const after = useStore.getState().draftPresentation!

    const els = after.slides[0].elements
    expect(els.find((e) => e.id === aId)!.x).toBe(5)
    expect(els.find((e) => e.id === bId)!.y).toBe(7)
    expect(after).not.toBe(before) // one new presentation reference, not N
  })

  it("coalesces rapid updateDraftSlide edits into a single undo snapshot", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const useStore = await freshStore()
      const id = useStore.getState().createPresentation("Deck")
      useStore.getState().startEditing(id)
      const originalName = useStore.getState().draftPresentation!.slides[0].name

      // Three edits within one debounce window (identical timestamp).
      useStore.getState().updateDraftSlide({ name: "A" })
      useStore.getState().updateDraftSlide({ name: "B" })
      useStore.getState().updateDraftSlide({ name: "C" })
      expect(useStore.getState().draftPresentation!.slides[0].name).toBe("C")

      // Only one snapshot (before "A") was taken, so a single undo jumps all the
      // way back to the original — not to the intermediate "B".
      useStore.getState().undo()
      expect(useStore.getState().draftPresentation!.slides[0].name).toBe(
        originalName
      )
    } finally {
      nowSpy.mockRestore()
    }
  })

  it("export/import round-trips a presentation with fresh ids", async () => {
    const useStore = await freshStore()
    const id = useStore.getState().createPresentation("Original")
    const json = useStore.getState().exportPresentation(id)!
    expect(json).toBeTruthy()

    const importedId = useStore.getState().importPresentation(json)!
    expect(importedId).not.toBe(id)
    const imported = useStore.getState().getPresentationById(importedId)!
    expect(imported.name).toBe("Original (Imported)")
    expect(useStore.getState().importPresentation("garbage")).toBeNull()
  })
})
