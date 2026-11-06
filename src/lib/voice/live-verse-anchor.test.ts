import { describe, expect, it } from "vitest"
import type { Book } from "@/types/bible"
import { liveVerseAnchor } from "./live-verse-anchor"

const books: Book[] = [
  {
    id: 18,
    translation_id: 1,
    book_number: 18,
    name: "Job",
    abbreviation: "Job",
    testament: "OT",
  },
  {
    id: 24,
    translation_id: 1,
    book_number: 24,
    name: "Jeremiah",
    abbreviation: "Jer",
    testament: "OT",
  },
]

describe("liveVerseAnchor", () => {
  it("uses the committed live reference rather than a stale panel selection", () => {
    expect(
      liveVerseAnchor(
        {
          reference: "Jeremiah 2:5 (KJV)",
          segments: [{ verseNumber: 5, text: "Live text" }],
        },
        books,
        1
      )
    ).toMatchObject({
      book_number: 24,
      chapter: 2,
      verse: 5,
      book_name: "Jeremiah",
    })
  })

  it("fails closed when there is no live scripture", () => {
    expect(liveVerseAnchor(null, books, 1)).toBeNull()
  })
})
