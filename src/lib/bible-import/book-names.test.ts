import { describe, it, expect } from "vitest"
import { CANONICAL_BOOKS, resolveBook } from "./book-names"

describe("CANONICAL_BOOKS", () => {
  it("has exactly 66 books numbered 1..66 in order", () => {
    expect(CANONICAL_BOOKS).toHaveLength(66)
    CANONICAL_BOOKS.forEach((b, i) => expect(b.number).toBe(i + 1))
  })

  it("partitions OT (1-39) and NT (40-66)", () => {
    for (const b of CANONICAL_BOOKS) {
      expect(b.testament).toBe(b.number <= 39 ? "OT" : "NT")
    }
  })
})

describe("resolveBook", () => {
  it("resolves full names case-insensitively", () => {
    expect(resolveBook("Genesis")?.number).toBe(1)
    expect(resolveBook("genesis")?.number).toBe(1)
    expect(resolveBook("REVELATION")?.number).toBe(66)
  })

  it("resolves standard abbreviations, with or without a period", () => {
    expect(resolveBook("Gen")?.number).toBe(1)
    expect(resolveBook("Gen.")?.number).toBe(1)
    expect(resolveBook("Matt")?.number).toBe(40)
    expect(resolveBook("Rev")?.number).toBe(66)
  })

  it("resolves bare 1-66 numbers, string or number", () => {
    expect(resolveBook(1)?.name).toBe("Genesis")
    expect(resolveBook("43")?.name).toBe("John")
    expect(resolveBook(66)?.name).toBe("Revelation")
    expect(resolveBook(0)).toBeNull()
    expect(resolveBook(67)).toBeNull()
  })

  it("normalizes ordinal spellings across styles", () => {
    for (const v of ["1 John", "1John", "I John", "First John", "1st John"]) {
      expect(resolveBook(v)?.number).toBe(62)
    }
    for (const v of ["2 Kings", "II Kings", "Second Kings", "2Kgs"]) {
      expect(resolveBook(v)?.number).toBe(12)
    }
    expect(resolveBook("3 John")?.number).toBe(64)
  })

  it("handles known name variants", () => {
    expect(resolveBook("Psalm")?.number).toBe(19)
    expect(resolveBook("Psalms")?.number).toBe(19)
    expect(resolveBook("Song of Songs")?.number).toBe(22)
    expect(resolveBook("Song of Solomon")?.number).toBe(22)
  })

  it("returns null for unknown or empty input", () => {
    expect(resolveBook("Hezekiah")).toBeNull()
    expect(resolveBook("")).toBeNull()
    expect(resolveBook("   ")).toBeNull()
  })
})
