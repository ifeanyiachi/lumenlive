import { describe, it, expect } from "vitest"
import type { Verse } from "@/types"
import { buildScriptureScheduleItem } from "./schedule-items"

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
