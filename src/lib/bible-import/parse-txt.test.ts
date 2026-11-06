import { describe, it, expect } from "vitest"
import { parseTxt } from "./parse-txt"

describe("parseTxt", () => {
  it("parses standard 'Book C:V text' lines", () => {
    const { verses, warnings } = parseTxt(
      "Genesis 1:1 In the beginning God created the heaven and the earth.\n" +
        "John 3:16 For God so loved the world."
    )
    expect(warnings).toEqual([])
    expect(verses).toEqual([
      {
        book_number: 1,
        chapter: 1,
        verse: 1,
        text: "In the beginning God created the heaven and the earth.",
      },
      {
        book_number: 43,
        chapter: 3,
        verse: 16,
        text: "For God so loved the world.",
      },
    ])
  })

  it("handles ordinal book names and '.' verse separators", () => {
    const { verses } = parseTxt("1 John 4.8 God is love.")
    expect(verses).toEqual([
      { book_number: 62, chapter: 4, verse: 8, text: "God is love." },
    ])
  })

  it("tolerates extra whitespace / tabs between reference and text", () => {
    const { verses } = parseTxt("Psalms 23:1\t\tThe LORD is my shepherd.")
    expect(verses[0]).toMatchObject({
      book_number: 19,
      chapter: 23,
      verse: 1,
      text: "The LORD is my shepherd.",
    })
  })

  it("skips blank and unrecognized lines with warnings", () => {
    const { verses, warnings } = parseTxt(
      "\n# My Bible export\nGenesis 1:1 In the beginning.\nHezekiah 1:1 nope."
    )
    expect(verses).toHaveLength(1)
    expect(warnings).toHaveLength(2) // header line + unknown book
    expect(warnings.some((w) => w.includes("unknown book"))).toBe(true)
  })
})
