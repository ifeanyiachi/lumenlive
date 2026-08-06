import { describe, it, expect } from "vitest"
import { chipEnglishWord } from "./lexicon-gloss"
import type { OriginalWord } from "@/types"

function word(partial: Partial<OriginalWord>): OriginalWord {
  return {
    position: 1,
    word: "",
    translit: null,
    strong_number: null,
    morph: null,
    gloss: null,
    english_word: null,
    ...partial,
  }
}

describe("chipEnglishWord", () => {
  it("prefers the aligned in-context English word for both languages", () => {
    expect(
      chipEnglishWord(word({ english_word: "God", gloss: "god" }), false)
    ).toBe("God")
    expect(
      chipEnglishWord(
        word({ english_word: "beginning", gloss: "angels" }),
        true
      )
    ).toBe("beginning")
  })

  it("falls back to the contextual gloss for Greek when not aligned", () => {
    expect(
      chipEnglishWord(word({ english_word: null, gloss: "God" }), false)
    ).toBe("God")
  })

  it("shows nothing for unaligned Hebrew (its gloss is a messy usage list)", () => {
    expect(
      chipEnglishWord(word({ english_word: null, gloss: "bear, beget" }), true)
    ).toBe("")
  })

  it("returns empty string when there is nothing to show", () => {
    expect(chipEnglishWord(word({}), true)).toBe("")
    expect(chipEnglishWord(word({}), false)).toBe("")
  })
})
