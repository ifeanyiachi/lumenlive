import { describe, expect, it } from "vitest"
import { buildVerseEditFromSegment } from "./multi-edit"
import type { StyledVerseSegment } from "@/types/verse-edit"

const segment: StyledVerseSegment = {
  verseNumber: 16,
  text: "For God so loved",
  spans: [{ start: 0, end: 3, style: { bold: true } }],
}

describe("buildVerseEditFromSegment", () => {
  it("wraps a single edited segment into a VerseEdit", () => {
    const edit = buildVerseEditFromSegment({
      key: "1:43:3:16",
      reference: "John 3:16 (KJV)",
      originalText: "For God so loved",
      segment,
      now: 1000,
    })
    expect(edit).toEqual({
      key: "1:43:3:16",
      reference: "John 3:16 (KJV)",
      originalText: "For God so loved",
      segments: [segment],
      createdAt: 1000,
      updatedAt: 1000,
    })
  })

  it("preserves an existing createdAt while stamping updatedAt to now", () => {
    const edit = buildVerseEditFromSegment({
      key: "k",
      reference: "r",
      originalText: "hi",
      segment: { verseNumber: 1, text: "hi" },
      createdAt: 500,
      now: 2000,
    })
    expect(edit.createdAt).toBe(500)
    expect(edit.updatedAt).toBe(2000)
  })
})
