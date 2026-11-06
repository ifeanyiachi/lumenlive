import { describe, it, expect } from "vitest"
import { flattenVerseContent } from "./flatten"

describe("flattenVerseContent", () => {
  it("returns string-only content unchanged (trimmed)", () => {
    expect(flattenVerseContent(["For God so loved the world"])).toBe(
      "For God so loved the world"
    )
  })

  it("drops a footnote ref mid-verse without fusing the surrounding words", () => {
    expect(
      flattenVerseContent([
        "In the beginning ",
        { noteId: 0 },
        "God created the heavens.",
      ])
    ).toBe("In the beginning God created the heavens.")
  })

  it("inserts a word boundary where a footnote split two words with no space", () => {
    // Real BSB John 3:16 shape — source keeps no space around the marker.
    expect(
      flattenVerseContent([
        "For God so loved the world that He gave His one and only",
        { noteId: 17 },
        "Son, that everyone who believes in Him shall not perish.",
      ])
    ).toBe(
      "For God so loved the world that He gave His one and only Son, " +
        "that everyone who believes in Him shall not perish."
    )
  })

  it("does not insert a space when a footnote sits before punctuation", () => {
    expect(flattenVerseContent(["have eternal life", { noteId: 3 }, "."])).toBe(
      "have eternal life."
    )
  })

  it("preserves an in-string space before punctuation (French typography)", () => {
    // The space lives inside the string, not around a marker — never stripped.
    expect(flattenVerseContent(["Car Dieu a tant aimé le monde !"])).toBe(
      "Car Dieu a tant aimé le monde !"
    )
  })

  it("turns a line break into a single space", () => {
    expect(
      flattenVerseContent([
        "The LORD is my shepherd;",
        { lineBreak: true },
        "I shall not want.",
      ])
    ).toBe("The LORD is my shepherd; I shall not want.")
  })

  it("appends the text of formatted segments (poem / words of Jesus)", () => {
    expect(
      flattenVerseContent([
        { text: "Truly I say", wordsOfJesus: true },
        " to you.",
      ])
    ).toBe("Truly I say to you.")
    expect(flattenVerseContent([{ text: "Praise the LORD", poem: 1 }])).toBe(
      "Praise the LORD"
    )
  })

  it("drops bare poem markers that carry no text", () => {
    expect(flattenVerseContent([{ poem: 1 }, "Praise the LORD"])).toBe(
      "Praise the LORD"
    )
  })

  it("collapses runs of whitespace introduced by breaks and padding", () => {
    expect(
      flattenVerseContent(["Hello   ", { lineBreak: true }, "  world"])
    ).toBe("Hello world")
  })

  it("returns an empty string for content with no text", () => {
    expect(flattenVerseContent([])).toBe("")
    expect(flattenVerseContent([{ noteId: 3 }, { poem: 2 }])).toBe("")
  })
})
