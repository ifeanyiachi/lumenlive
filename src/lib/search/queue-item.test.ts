import { describe, it, expect } from "vitest"
import type { Verse } from "@/types"
import { makeQueueItem } from "./queue-item"

const verse = (over: Partial<Verse> = {}): Verse =>
  ({
    id: 42,
    translation_id: 1,
    book_number: 43,
    book_name: "John",
    book_abbreviation: "Jn",
    chapter: 3,
    verse: 16,
    text: "For God so loved the world…",
    ...over,
  }) as Verse

describe("makeQueueItem", () => {
  it("builds a manual single-verse item (book row: confidence 1)", () => {
    const item = makeQueueItem({
      verse: verse(),
      reference: "John 3:16",
      confidence: 1,
    })
    expect(item).toMatchObject({
      verse: verse(),
      reference: "John 3:16",
      confidence: 1,
      source: "manual",
    })
    expect(typeof item.id).toBe("string")
    expect(item.id.length).toBeGreaterThan(0)
    expect(typeof item.added_at).toBe("number")
    // A single verse omits `verses` entirely (not set to undefined).
    expect("verses" in item).toBe(false)
  })

  it("carries a similarity confidence (context row)", () => {
    const item = makeQueueItem({
      verse: verse(),
      reference: "John 3:16",
      confidence: 0.87,
    })
    expect(item.confidence).toBe(0.87)
    expect(item.source).toBe("manual")
  })

  it("includes the verses array for a grouped multi-verse item", () => {
    const group = [verse({ verse: 16 }), verse({ verse: 17 })]
    const item = makeQueueItem({
      verse: group[0],
      verses: group,
      reference: "John 3:16-17",
      confidence: 1,
    })
    expect(item.verses).toEqual(group)
    expect(item.verse).toBe(group[0])
    expect(item.reference).toBe("John 3:16-17")
  })

  it("generates a unique id per call", () => {
    const a = makeQueueItem({ verse: verse(), reference: "r", confidence: 1 })
    const b = makeQueueItem({ verse: verse(), reference: "r", confidence: 1 })
    expect(a.id).not.toBe(b.id)
  })
})
