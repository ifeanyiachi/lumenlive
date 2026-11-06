import { describe, expect, it, beforeEach, vi } from "vitest"
import type { Presentation } from "@/types/slide"

// vi.hoisted so the mock exists before persistence's static import of plugin-store.
const { storeGet } = vi.hoisted(() => ({ storeGet: vi.fn() }))
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(async () => ({
    get: storeGet,
    set: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  })),
}))

import { loadStoredPresentations } from "./persistence"

/** Minimal structurally-valid persisted presentation (partial fixture). */
function deck(id: string): Presentation {
  return {
    id,
    name: id,
    slides: [
      {
        id: `${id}-s1`,
        name: "slide",
        background: { type: "solid", color: "#000000" },
        elements: [{ type: "text", id: `${id}-e1` }],
        createdAt: 0,
        updatedAt: 0,
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Presentation
}

beforeEach(() => {
  storeGet.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("loadStoredPresentations", () => {
  it("returns null when nothing is persisted", async () => {
    storeGet.mockResolvedValue(undefined)
    expect(await loadStoredPresentations()).toBeNull()
  })

  it("returns null for a non-array / empty value", async () => {
    storeGet.mockResolvedValue({ not: "an array" })
    expect(await loadStoredPresentations()).toBeNull()
    storeGet.mockResolvedValue([])
    expect(await loadStoredPresentations()).toBeNull()
  })

  it("loads all structurally valid decks", async () => {
    storeGet.mockResolvedValue([deck("a"), deck("b")])
    const result = await loadStoredPresentations()
    expect(result?.map((p) => p.id)).toEqual(["a", "b"])
  })

  it("skips a single malformed deck without dropping the good ones", async () => {
    storeGet.mockResolvedValue([
      deck("good1"),
      { id: "missing-slides", name: "x" }, // no slides array
      { id: "bad-slide", slides: [{ id: "s", elements: "nope" }] }, // elements not an array
      deck("good2"),
    ])
    const result = await loadStoredPresentations()
    expect(result?.map((p) => p.id)).toEqual(["good1", "good2"])
  })

  it("returns null when every deck is malformed (rather than throwing)", async () => {
    storeGet.mockResolvedValue([{ id: "x" }, { nope: true }, null])
    await expect(loadStoredPresentations()).resolves.toBeNull()
  })
})
