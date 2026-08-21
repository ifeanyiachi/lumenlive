import { describe, expect, it } from "vitest"
import type { Presentation } from "@/types/slide"
import { isPresentationNameTaken, makeUniquePresentationName } from "./naming"

function deck(id: string, name: string): Presentation {
  return { id, name, slides: [], createdAt: 0, updatedAt: 0 }
}

const library = [deck("a", "Sunday Service"), deck("b", "Youth Night")]

describe("isPresentationNameTaken", () => {
  it("detects an exact match", () => {
    expect(isPresentationNameTaken(library, "Sunday Service")).toBe(true)
  })

  it("is case-insensitive and trims", () => {
    expect(isPresentationNameTaken(library, "  sunday service  ")).toBe(true)
    expect(isPresentationNameTaken(library, "YOUTH NIGHT")).toBe(true)
  })

  it("returns false for an unused name", () => {
    expect(isPresentationNameTaken(library, "Christmas")).toBe(false)
  })

  it("skips the excluded deck (self-rename)", () => {
    expect(isPresentationNameTaken(library, "Sunday Service", "a")).toBe(false)
    // but still collides with a *different* deck of that name
    expect(isPresentationNameTaken(library, "Youth Night", "a")).toBe(true)
  })
})

describe("makeUniquePresentationName", () => {
  it("returns the base name when free", () => {
    expect(makeUniquePresentationName(library, "Christmas")).toBe("Christmas")
  })

  it("suffixes with (2) on first collision", () => {
    expect(makeUniquePresentationName(library, "Sunday Service")).toBe(
      "Sunday Service (2)"
    )
  })

  it("keeps incrementing past taken suffixes", () => {
    const lib = [
      deck("a", "Deck"),
      deck("b", "Deck (2)"),
      deck("c", "Deck (3)"),
    ]
    expect(makeUniquePresentationName(lib, "Deck")).toBe("Deck (4)")
  })

  it("trims the base and falls back for empty input", () => {
    expect(makeUniquePresentationName(library, "   ")).toBe("Presentation")
    expect(makeUniquePresentationName(library, "  Christmas  ")).toBe(
      "Christmas"
    )
  })

  it("respects excludeId so a deck's own name stays stable", () => {
    expect(makeUniquePresentationName(library, "Sunday Service", "a")).toBe(
      "Sunday Service"
    )
  })
})
