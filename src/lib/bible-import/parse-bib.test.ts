import { describe, it, expect } from "vitest"
import { parseBib } from "./parse-bib"

describe("parseBib — Zefania XML", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<XMLBIBLE biblename="Demo">
  <BIBLEBOOK bnumber="1" bname="Genesis">
    <CHAPTER cnumber="1">
      <VERS vnumber="1">In the beginning God created <STYLE>the</STYLE> heaven.</VERS>
      <VERS vnumber="2">And the earth was without form.</VERS>
    </CHAPTER>
  </BIBLEBOOK>
  <BIBLEBOOK bnumber="43" bname="John">
    <CHAPTER cnumber="3">
      <VERS vnumber="16">For God so loved the world.</VERS>
    </CHAPTER>
  </BIBLEBOOK>
</XMLBIBLE>`

  it("extracts verses keyed by bnumber/cnumber/vnumber", () => {
    const { verses } = parseBib(xml)
    expect(verses).toHaveLength(3)
    expect(verses[0]).toEqual({
      book_number: 1,
      chapter: 1,
      verse: 1,
      text: "In the beginning God created the heaven.",
    })
    expect(verses[2]).toMatchObject({ book_number: 43, chapter: 3, verse: 16 })
  })

  it("strips inline tags and decodes entities", () => {
    const { verses } = parseBib(
      `<bible><BIBLEBOOK bnumber="1"><CHAPTER cnumber="1">` +
        `<VERS vnumber="1">Jacob &amp; Esau &lt;here&gt;</VERS>` +
        `</CHAPTER></BIBLEBOOK></bible>`
    )
    expect(verses[0].text).toBe("Jacob & Esau <here>")
  })
})

describe("parseBib — delimited (Unbound-style)", () => {
  it("parses tab-delimited book/chapter/verse/text", () => {
    const { verses } = parseBib(
      "Genesis\t1\t1\tIn the beginning\nJohn\t3\t16\tFor God so loved the world"
    )
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

  it("folds trailing columns into the text and skips comments", () => {
    const { verses } = parseBib("# header\nGen\t1\t1\ttext with\ttabs inside")
    expect(verses[0].text).toBe("text with\ttabs inside")
  })

  it("warns and yields nothing for empty XML", () => {
    const { verses, warnings } = parseBib("<XMLBIBLE></XMLBIBLE>")
    expect(verses).toHaveLength(0)
    expect(warnings.length).toBeGreaterThan(0)
  })
})
