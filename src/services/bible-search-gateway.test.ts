import { describe, expect, it, beforeEach, vi } from "vitest"

// vi.hoisted so the mock fn exists before the gateway's static import runs.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import { fetchChapter, runSemanticSearch } from "./bible-search-gateway"

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockResolvedValue([])
})

describe("bible-search-gateway", () => {
  it("fetchChapter invokes get_chapter with the id triple", async () => {
    await fetchChapter(2, 43, 3)
    expect(invokeMock).toHaveBeenCalledWith("get_chapter", {
      translationId: 2,
      bookNumber: 43,
      chapter: 3,
    })
  })

  it("runSemanticSearch invokes semantic_search with query and limit", async () => {
    await runSemanticSearch("loved the world", 15)
    expect(invokeMock).toHaveBeenCalledWith("semantic_search", {
      query: "loved the world",
      limit: 15,
    })
  })
})
