import { describe, it, expect } from "vitest"
import { USFM_BOOKS, mapBook } from "./usfm-books"

describe("mapBook", () => {
  it("routes canonical books to their standard Protestant number", () => {
    expect(mapBook("GEN")).toMatchObject({ number: 1, testament: "OT" })
    expect(mapBook("MAL")).toMatchObject({ number: 39, testament: "OT" })
    expect(mapBook("MAT")).toMatchObject({ number: 40, testament: "NT" })
    expect(mapBook("JHN")).toMatchObject({
      number: 43,
      name: "John",
      testament: "NT",
    })
    expect(mapBook("REV")).toMatchObject({ number: 66, testament: "NT" })
  })

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(mapBook("gen")).toEqual(mapBook("GEN"))
    expect(mapBook("  jhn  ")).toEqual(mapBook("JHN"))
  })

  it("routes deuterocanon/LXX books to stable numbers >= 67 tagged DC", () => {
    const sir = mapBook("SIR")
    expect(sir).not.toBeNull()
    expect(sir!.number).toBeGreaterThanOrEqual(67)
    expect(sir!.testament).toBe("DC")
    expect(sir!.name).toBe("Sirach")

    const tob = mapBook("TOB")
    expect(tob!.number).toBe(67)
    expect(tob!.testament).toBe("DC")
  })

  it("returns null for an unknown USFM id (caller skips + warns)", () => {
    expect(mapBook("XYZ")).toBeNull()
    expect(mapBook("")).toBeNull()
  })
})

describe("USFM_BOOKS", () => {
  it("assigns a unique book_number to every entry", () => {
    const numbers = Object.values(USFM_BOOKS).map((b) => b.number)
    expect(new Set(numbers).size).toBe(numbers.length)
  })

  it("covers all 66 canonical numbers contiguously", () => {
    const canonical = Object.values(USFM_BOOKS)
      .map((b) => b.number)
      .filter((n) => n <= 66)
      .sort((a, b) => a - b)
    expect(canonical).toEqual(Array.from({ length: 66 }, (_, i) => i + 1))
  })

  it("numbers deuterocanon contiguously from 67 with no canonical overlap", () => {
    const dc = Object.values(USFM_BOOKS)
      .filter((b) => b.testament === "DC")
      .map((b) => b.number)
      .sort((a, b) => a - b)
    expect(dc[0]).toBe(67)
    // contiguous
    dc.forEach((n, i) => expect(n).toBe(67 + i))
  })
})
