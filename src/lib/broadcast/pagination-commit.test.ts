import { describe, it, expect } from "vitest"
import { resolveVersePages } from "./pagination-commit"
import type { VerseRenderData, BroadcastOutput } from "@/types/broadcast"
import type { Theme } from "@/types/theme"

const verse: VerseRenderData = {
  reference: "John 3:16",
  segments: [{ text: "For God so loved the world" }],
}
const themes = [{ id: "t1" }] as unknown as Theme[]

describe("resolveVersePages", () => {
  it("returns [] for a null verse", () => {
    expect(resolveVersePages(null, [], themes)).toEqual([])
  })

  it("returns the single verse unpaginated when the main output disables auto-fit", () => {
    // autoFit=false short-circuits pagination → the verse is its own only page.
    const outputs = [
      { id: "main", themeId: "t1", verseAutoFit: false },
    ] as unknown as BroadcastOutput[]
    expect(resolveVersePages(verse, outputs, themes)).toEqual([verse])
  })

  it("returns the single verse when pagination is disabled on the main output", () => {
    const outputs = [
      {
        id: "main",
        themeId: "t1",
        verseAutoFit: true,
        paginateLongVerses: false,
      },
    ] as unknown as BroadcastOutput[]
    expect(resolveVersePages(verse, outputs, themes)).toEqual([verse])
  })
})
