import { describe, it, expect } from "vitest"
import { parseBibleFile, UnsupportedTextFormatError } from "./index"

describe("parseBibleFile", () => {
  it("dispatches by extension", () => {
    expect(
      parseBibleFile("kjv.txt", "Genesis 1:1 In the beginning").verses
    ).toHaveLength(1)
    expect(
      parseBibleFile("kjv.csv", "Genesis,1,1,In the beginning").verses
    ).toHaveLength(1)
    expect(
      parseBibleFile("kjv.bib", "Genesis\t1\t1\tIn the beginning").verses
    ).toHaveLength(1)
  })

  it("throws UnsupportedTextFormatError for sqlite/docx/pdf/unknown", () => {
    for (const name of ["x.sqlite", "x.docx", "x.pdf", "x.foo"]) {
      expect(() => parseBibleFile(name, "")).toThrow(UnsupportedTextFormatError)
    }
  })
})
