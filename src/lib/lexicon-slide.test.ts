import { describe, it, expect, vi } from "vitest"
import type { OriginalWord, LexiconEntry } from "@/types"

// The card is rasterized on a canvas (unavailable in jsdom) and warms an image
// cache; stub both so the pure builder logic can be exercised in isolation.
vi.mock("@/lib/lexicon-card-renderer", () => ({
  renderLexiconCardToDataUrl: () => "data:image/png;base64,STUB",
}))
vi.mock("@/lib/slide-image-cache", () => ({
  preloadSlideImage: () => Promise.resolve(),
}))

import { buildLexiconScheduleItem, lexiconCardLabel } from "./lexicon-slide"

function word(partial: Partial<OriginalWord>): OriginalWord {
  return {
    position: 1,
    word: "θεός",
    translit: "theos",
    strong_number: "G2316",
    morph: null,
    gloss: "God",
    english_word: "God",
    ...partial,
  }
}

const entry: LexiconEntry = {
  strong_number: "G2316",
  language: "greek",
  lemma: "θεός",
  translit: "theos",
  pronunciation: "theh'-os",
  definition: "a deity",
  kjv_usage: "God",
  derivation: null,
}

describe("buildLexiconScheduleItem", () => {
  it("produces a lexicon item that carries the card inline (not the verse)", () => {
    const item = buildLexiconScheduleItem(word({}), entry, "John 1:1", false, 3)
    expect(item.type).toBe("lexicon")
    expect(item.reference).toBe("John 1:1")
    expect(item.strong).toBe("G2316")
    expect(item.order).toBe(3)
    expect(item.label).toBe(lexiconCardLabel(word({}), "John 1:1"))
    // The presented content is the rendered card slide, so going live shows the
    // Lexical Summary — exactly what Go Live does.
    expect(item.slide.elements).toHaveLength(1)
    expect(item.slide.elements[0].type).toBe("image")
  })

  it("omits the Strong's number when the word has none", () => {
    const item = buildLexiconScheduleItem(
      word({ strong_number: null }),
      null,
      "Genesis 1:1",
      true,
      0
    )
    expect(item.strong).toBeUndefined()
  })
})
