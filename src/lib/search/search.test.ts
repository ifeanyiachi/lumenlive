import { describe, expect, it } from "vitest"
import { verseLocationKey, verseReference } from "./verse-keys"
import { buildQueryWordSet, isHighlightedWord } from "./highlight"
import { resolveEffectiveVerseId } from "./verse-selection"
import type { Verse } from "@/types"

const verse = (over: Partial<Verse>): Verse => ({
  id: 1,
  translation_id: 1,
  book_number: 43,
  book_name: "John",
  book_abbreviation: "Jn",
  chapter: 3,
  verse: 16,
  text: "For God so loved the world",
  ...over,
})

describe("verse-keys", () => {
  it("verseLocationKey formats book:chapter:verse", () => {
    expect(verseLocationKey(43, 3, 16)).toBe("43:3:16")
  })

  it("verseReference formats a human reference", () => {
    expect(verseReference({ book_name: "John", chapter: 3, verse: 16 })).toBe(
      "John 3:16"
    )
  })
})

describe("highlight", () => {
  it("buildQueryWordSet lowercases and drops words under 2 chars", () => {
    expect([...buildQueryWordSet("For God so")]).toEqual(["for", "god", "so"])
    expect([...buildQueryWordSet("a I")]).toEqual([])
    expect(buildQueryWordSet("").size).toBe(0)
  })

  it("isHighlightedWord strips punctuation before matching", () => {
    const words = buildQueryWordSet("god world")
    expect(isHighlightedWord("God,", words)).toBe(true)
    expect(isHighlightedWord("world.", words)).toBe(true)
    expect(isHighlightedWord("loved", words)).toBe(false)
    // Whitespace parts (from the split) never match.
    expect(isHighlightedWord(" ", words)).toBe(false)
  })
})

describe("resolveEffectiveVerseId", () => {
  const chapter = [
    verse({ id: 10, verse: 1 }),
    verse({ id: 11, verse: 2 }),
    verse({ id: 12, verse: 3 }),
  ]

  it("returns null with no selection or empty chapter", () => {
    expect(resolveEffectiveVerseId(chapter, null, null)).toBeNull()
    expect(resolveEffectiveVerseId([], 11, verse({ id: 11 }))).toBeNull()
  })

  it("keeps the id when it still exists in the chapter", () => {
    expect(
      resolveEffectiveVerseId(chapter, 11, verse({ id: 11, verse: 2 }))
    ).toBe(11)
  })

  it("falls back to matching by verse number after a reload changed ids", () => {
    // Selected id 99 is gone; selected verse number 3 maps to id 12.
    expect(
      resolveEffectiveVerseId(chapter, 99, verse({ id: 99, verse: 3 }))
    ).toBe(12)
  })

  it("returns null when the id is gone and there is no selected verse to match", () => {
    expect(resolveEffectiveVerseId(chapter, 99, null)).toBeNull()
  })
})
