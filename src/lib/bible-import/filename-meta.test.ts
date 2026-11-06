import { describe, it, expect } from "vitest"
import { deriveMetaFromFileName } from "./filename-meta"

describe("deriveMetaFromFileName", () => {
  it("treats a single token as an abbreviation for both fields", () => {
    expect(deriveMetaFromFileName("nkjv.csv")).toEqual({
      abbreviation: "NKJV",
      title: "NKJV",
    })
  })

  it("title-cases multi-word names and builds an initialism", () => {
    expect(deriveMetaFromFileName("new-king-james.txt")).toEqual({
      abbreviation: "NKJ",
      title: "New King James",
    })
    expect(deriveMetaFromFileName("web_bible.sqlite")).toEqual({
      abbreviation: "WB",
      title: "Web Bible",
    })
  })

  it("strips directories (both slash styles) and the extension", () => {
    expect(deriveMetaFromFileName("C:\\Users\\me\\Downloads\\esv.bib")).toEqual(
      {
        abbreviation: "ESV",
        title: "ESV",
      }
    )
    expect(deriveMetaFromFileName("/home/me/asv.txt").abbreviation).toBe("ASV")
  })

  it("handles files with no usable stem", () => {
    expect(deriveMetaFromFileName(".txt")).toEqual({
      abbreviation: "",
      title: "",
    })
  })

  it("caps overly long codes at 12 chars", () => {
    expect(
      deriveMetaFromFileName("supercalifragilistic.txt").abbreviation.length
    ).toBeLessThanOrEqual(12)
  })
})
