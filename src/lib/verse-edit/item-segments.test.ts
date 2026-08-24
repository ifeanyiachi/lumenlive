import { describe, it, expect } from "vitest"
import type { Verse } from "@/types/bible"
import type { ScriptureScheduleItem } from "@/types/schedule"
import { plainItemVerseSegment, rangeRenderDataForItem } from "./item-segments"

const verse = (n: number, text: string): Verse => ({
  id: n,
  translation_id: 7,
  book_number: 43,
  book_name: "John",
  book_abbreviation: "Jn",
  chapter: 3,
  verse: n,
  text,
})

const rangeItem = (
  segments?: ScriptureScheduleItem["segments"]
): ScriptureScheduleItem => ({
  id: "x",
  type: "scripture",
  label: "John 3:16-17 (KJV)",
  order: 0,
  translationId: 7,
  bookNumber: 43,
  chapter: 3,
  verseStart: 16,
  verseEnd: 17,
  cachedReference: "John 3:16-17 (KJV)",
  cachedText: "a b",
  segments,
})

describe("item-scoped verse segments", () => {
  it("finds a plain item's edit for a verse, or undefined", () => {
    const item = rangeItem([
      { verseNumber: 16, text: "loved", spans: [{ start: 0, end: 5, style: { bold: true } }] },
    ])
    expect(plainItemVerseSegment(item, 16)?.text).toBe("loved")
    expect(plainItemVerseSegment(item, 17)).toBeUndefined()
    expect(plainItemVerseSegment(rangeItem(), 16)).toBeUndefined()
  })

  it("builds range render data using item edits, plain text otherwise", () => {
    const item = rangeItem([
      { verseNumber: 17, text: "SAVE", spans: [{ start: 0, end: 4, style: { italic: true } }] },
    ])
    const rd = rangeRenderDataForItem(item, [verse(17, "save"), verse(16, "for God")], "KJV")
    expect(rd.reference).toBe("John 3:16-17 (KJV)")
    // Sorted canonical; verse 16 falls back to plain, verse 17 uses the edit.
    expect(rd.segments.map((s) => s.text)).toEqual(["for God", "SAVE"])
    expect(rd.segments[1].spans).toEqual([
      { start: 0, end: 4, style: { italic: true } },
    ])
  })

  it("uses only plain text when the item has no edits", () => {
    const rd = rangeRenderDataForItem(rangeItem(), [verse(16, "for God"), verse(17, "save")], "KJV")
    expect(rd.segments.map((s) => s.text)).toEqual(["for God", "save"])
    expect(rd.segments.every((s) => s.spans === undefined)).toBe(true)
  })
})
