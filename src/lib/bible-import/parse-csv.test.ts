import { describe, it, expect } from "vitest"
import { parseCsv } from "./parse-csv"

describe("parseCsv", () => {
  it("parses a headered CSV, matching columns by name", () => {
    const { verses, warnings } = parseCsv(
      "book,chapter,verse,text\n" +
        "Genesis,1,1,In the beginning\n" +
        "John,3,16,For God so loved the world"
    )
    expect(warnings).toEqual([])
    expect(verses).toEqual([
      { book_number: 1, chapter: 1, verse: 1, text: "In the beginning" },
      {
        book_number: 43,
        chapter: 3,
        verse: 16,
        text: "For God so loved the world",
      },
    ])
  })

  it("handles reordered headers and book_number column", () => {
    const { verses } = parseCsv(
      "text,verse,chapter,book_number\n" + "In the beginning,1,1,1"
    )
    expect(verses[0]).toEqual({
      book_number: 1,
      chapter: 1,
      verse: 1,
      text: "In the beginning",
    })
  })

  it("respects quoted fields containing commas", () => {
    const { verses } = parseCsv(
      "book,chapter,verse,text\n" +
        'John,11,35,"Jesus wept, and the people saw."'
    )
    expect(verses[0].text).toBe("Jesus wept, and the people saw.")
  })

  it("falls back to positional columns when there is no header", () => {
    const { verses } = parseCsv("Gen,1,1,In the beginning")
    expect(verses[0]).toMatchObject({ book_number: 1, chapter: 1, verse: 1 })
  })

  it("sniffs a tab delimiter (TSV)", () => {
    const { verses } = parseCsv("Genesis\t1\t1\tIn the beginning")
    expect(verses[0]).toMatchObject({
      book_number: 1,
      text: "In the beginning",
    })
  })

  it("skips rows with an unresolvable book or non-numeric ref", () => {
    const { verses, warnings } = parseCsv(
      "book,chapter,verse,text\nNope,1,1,x\nGenesis,a,1,y\nGenesis,1,1,ok"
    )
    expect(verses).toHaveLength(1)
    expect(verses[0].text).toBe("ok")
    expect(warnings.length).toBe(2)
  })
})
