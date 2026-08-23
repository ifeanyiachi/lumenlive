import { describe, it, expect } from "vitest"
import type { ScriptureScheduleItem } from "@/types/schedule"
import {
  isScriptureCollection,
  scriptureCollectionDeckLength,
  collectionVerseToVerse,
  scriptureCollectionVerses,
} from "./scripture-collection"

const collectionItem = (): ScriptureScheduleItem => ({
  id: "x",
  type: "scripture",
  label: "John 3:16-18 (KJV)",
  order: 0,
  translationId: 7,
  bookNumber: 43,
  chapter: 3,
  verseStart: 16,
  verseEnd: 18,
  cachedReference: "John 3:16-18 (KJV)",
  cachedText: "a b c",
  groupCollection: true,
  collectionVerses: [
    {
      translationId: 7,
      bookNumber: 43,
      bookName: "John",
      bookAbbreviation: "Jn",
      chapter: 3,
      verse: 16,
      text: "a",
      reference: "John 3:16 (KJV)",
    },
    {
      translationId: 7,
      bookNumber: 43,
      bookName: "John",
      bookAbbreviation: "Jn",
      chapter: 3,
      verse: 17,
      text: "b",
      reference: "John 3:17 (KJV)",
    },
  ],
})

const plainItem = (): ScriptureScheduleItem => ({
  id: "y",
  type: "scripture",
  label: "John 3:16 (KJV)",
  order: 0,
  translationId: 7,
  bookNumber: 43,
  chapter: 3,
  verseStart: 16,
  verseEnd: 16,
  cachedReference: "John 3:16 (KJV)",
  cachedText: "a",
})

describe("scripture-collection helpers", () => {
  it("recognizes a collection only when flagged with cached verses", () => {
    expect(isScriptureCollection(collectionItem())).toBe(true)
    expect(isScriptureCollection(plainItem())).toBe(false)
    expect(
      isScriptureCollection({
        ...collectionItem(),
        collectionVerses: [],
      })
    ).toBe(false)
  })

  it("deck length is the combined block plus one slide per verse", () => {
    expect(scriptureCollectionDeckLength(collectionItem())).toBe(3)
    expect(scriptureCollectionDeckLength(plainItem())).toBe(0)
  })

  it("reconstructs a Verse from a cached collection verse", () => {
    const cv = collectionItem().collectionVerses![0]
    expect(collectionVerseToVerse(cv)).toEqual({
      id: 0,
      translation_id: 7,
      book_number: 43,
      book_name: "John",
      book_abbreviation: "Jn",
      chapter: 3,
      verse: 16,
      text: "a",
    })
  })

  it("maps all cached verses to Verses in order", () => {
    const verses = scriptureCollectionVerses(collectionItem())
    expect(verses.map((v) => v.verse)).toEqual([16, 17])
    expect(scriptureCollectionVerses(plainItem())).toEqual([])
  })
})
