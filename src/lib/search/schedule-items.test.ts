import { describe, it, expect } from "vitest"
import type { Verse } from "@/types"
import type { StyledVerseSegment } from "@/types/verse-edit"
import {
  buildScriptureScheduleItem,
  buildGroupedScriptureScheduleItem,
  buildScriptureCollectionScheduleItem,
} from "./schedule-items"

const verse = (over: Partial<Verse> = {}): Verse =>
  ({
    id: 42,
    translation_id: 7,
    book_number: 43,
    book_name: "John",
    book_abbreviation: "Jn",
    chapter: 3,
    verse: 16,
    text: "For God so loved the world…",
    ...over,
  }) as Verse

describe("buildScriptureScheduleItem", () => {
  it("builds a scripture item with the verse's range + cached display fields", () => {
    const item = buildScriptureScheduleItem(verse(), "KJV", 5)
    expect(item).toMatchObject({
      type: "scripture",
      label: "John 3:16 (KJV)",
      order: 5,
      notes: "",
      translationId: 7,
      bookNumber: 43,
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      cachedReference: "John 3:16 (KJV)",
      cachedText: "For God so loved the world…",
    })
    expect(typeof item.id).toBe("string")
  })

  it("uses the passed order (caller owns insert sequencing)", () => {
    expect(buildScriptureScheduleItem(verse(), "KJV", 0).order).toBe(0)
    expect(buildScriptureScheduleItem(verse(), "KJV", 12).order).toBe(12)
  })

  it("keeps cachedReference identical to the label", () => {
    const item = buildScriptureScheduleItem(
      verse({ book_name: "Psalms", chapter: 23, verse: 1 }),
      "ESV",
      0
    )
    expect(item.cachedReference).toBe(item.label)
    expect(item.label).toBe("Psalms 23:1 (ESV)")
  })
})

describe("buildGroupedScriptureScheduleItem", () => {
  it("collapses a contiguous selection into one ranged item", () => {
    const verses = [
      verse({ id: 1, verse: 16, text: "For God so loved the world" }),
      verse({ id: 2, verse: 17, text: "For God sent not his Son" }),
      verse({ id: 3, verse: 18, text: "He that believeth on him" }),
    ]
    const item = buildGroupedScriptureScheduleItem(verses, "KJV", 4)
    expect(item).toMatchObject({
      type: "scripture",
      label: "John 3:16-18 (KJV)",
      order: 4,
      bookNumber: 43,
      chapter: 3,
      verseStart: 16,
      verseEnd: 18,
      cachedReference: "John 3:16-18 (KJV)",
      cachedText:
        "For God so loved the world For God sent not his Son He that believeth on him",
    })
  })

  it("sorts an out-of-order selection so range + text read canonically", () => {
    const verses = [
      verse({ id: 3, verse: 18, text: "c" }),
      verse({ id: 1, verse: 16, text: "a" }),
      verse({ id: 2, verse: 17, text: "b" }),
    ]
    const item = buildGroupedScriptureScheduleItem(verses, "KJV", 0)
    expect(item.verseStart).toBe(16)
    expect(item.verseEnd).toBe(18)
    expect(item.cachedText).toBe("a b c")
  })

  it("handles a single-verse group like a plain reference", () => {
    const item = buildGroupedScriptureScheduleItem([verse()], "KJV", 2)
    expect(item.label).toBe("John 3:16 (KJV)")
    expect(item.verseStart).toBe(16)
    expect(item.verseEnd).toBe(16)
  })

  it("attaches item-scoped edits (edited verses only) and uses their text", () => {
    const verses = [
      verse({ id: 1, verse: 16, text: "a" }),
      verse({ id: 2, verse: 17, text: "b" }),
    ]
    const seg: StyledVerseSegment = {
      verseNumber: 16,
      text: "EDITED",
      spans: [{ start: 0, end: 6, style: { bold: true } }],
    }
    const item = buildGroupedScriptureScheduleItem(
      verses,
      "KJV",
      0,
      new Map([[1, seg]])
    )
    // Only the edited verse is stored; its edited text feeds cachedText.
    expect(item.segments).toEqual([seg])
    expect(item.cachedText).toBe("EDITED b")
  })

  it("omits segments entirely when nothing was edited", () => {
    const item = buildGroupedScriptureScheduleItem([verse()], "KJV", 0, new Map())
    expect(item.segments).toBeUndefined()
  })
})

describe("buildScriptureCollectionScheduleItem", () => {
  const verses = [
    verse({ id: 3, verse: 18, text: "c" }),
    verse({ id: 1, verse: 16, text: "a" }),
    verse({ id: 2, verse: 17, text: "b" }),
  ]

  it("shares the combined block's top-level fields with the grouped add", () => {
    const combined = buildGroupedScriptureScheduleItem(verses, "KJV", 4)
    const collection = buildScriptureCollectionScheduleItem(verses, "KJV", 4)
    // Everything the combined block carries (minus the random id) must match, so
    // the collection's first deck slide presents byte-for-byte like a plain add.
    const { id: _c, ...combinedRest } = combined
    const {
      id: _k,
      groupCollection,
      collectionVerses,
      ...collectionRest
    } = collection
    expect(collectionRest).toEqual(combinedRest)
    expect(groupCollection).toBe(true)
    expect(collectionVerses).toBeDefined()
  })

  it("caches one collection verse per selection, in canonical order", () => {
    const item = buildScriptureCollectionScheduleItem(verses, "KJV", 0)
    expect(item.collectionVerses?.map((v) => v.verse)).toEqual([16, 17, 18])
    expect(item.collectionVerses?.map((v) => v.text)).toEqual(["a", "b", "c"])
    expect(item.collectionVerses?.[0]).toMatchObject({
      translationId: 7,
      bookNumber: 43,
      bookName: "John",
      bookAbbreviation: "Jn",
      chapter: 3,
      verse: 16,
      text: "a",
      reference: "John 3:16 (KJV)",
    })
  })

  it("stores edits per collection verse, not on a combined top-level field", () => {
    const seg: StyledVerseSegment = {
      verseNumber: 17,
      text: "B!",
      spans: [{ start: 0, end: 2, style: { italic: true } }],
    }
    // verse id 2 is verse 17 ("b").
    const item = buildScriptureCollectionScheduleItem(
      verses,
      "KJV",
      0,
      new Map([[2, seg]])
    )
    // The combined top-level `segments` is never set on a collection.
    expect(item.segments).toBeUndefined()
    const cv17 = item.collectionVerses?.find((v) => v.verse === 17)
    expect(cv17?.segment).toEqual(seg)
    expect(cv17?.text).toBe("B!")
    // Unedited verses carry no segment.
    expect(item.collectionVerses?.find((v) => v.verse === 16)?.segment).toBeUndefined()
  })
})
