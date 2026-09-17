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

import {
  buildLexiconScheduleItem,
  buildLexiconScheduleItemFromData,
  buildLexiconSlideFromData,
  lexiconCardDataLabel,
  lexiconCardLabel,
} from "./lexicon-slide"
import type { LexiconCardData } from "@/types/lexicon"

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

  it("stores the resolved card data so the item can be re-rendered/re-edited", () => {
    const item = buildLexiconScheduleItem(word({}), entry, "John 1:1", false, 0)
    expect(item.cardData).toBeDefined()
    expect(item.cardData?.reference).toBe("John 1:1")
    expect(item.cardData?.lemma).toBe("θεός")
  })
})

const card: LexiconCardData = {
  reference: "John 1:1",
  strong: "G2316",
  summary: "theos: God",
  lemma: "θεός",
  definition: "a deity",
  isHebrew: false,
}

describe("data-first lexicon builders", () => {
  it("buildLexiconSlideFromData yields a full-bleed image slide", () => {
    const slide = buildLexiconSlideFromData(card)
    expect(slide.elements).toHaveLength(1)
    expect(slide.elements[0].type).toBe("image")
    expect(slide.name).toBe(lexiconCardDataLabel(card))
  })

  it("buildLexiconScheduleItemFromData round-trips the card data (incl. styles)", () => {
    const styled: LexiconCardData = {
      ...card,
      styles: { definition: [{ start: 0, end: 1, style: { bold: true } }] },
    }
    const item = buildLexiconScheduleItemFromData(styled, 2)
    expect(item.type).toBe("lexicon")
    expect(item.order).toBe(2)
    expect(item.cardData).toEqual(styled)
    expect(item.reference).toBe("John 1:1")
    expect(item.strong).toBe("G2316")
  })

  it("lexiconCardDataLabel matches the word-based label when there is no entry lemma", () => {
    // With no entry, cardData.lemma falls back to word.word, so both agree.
    const plain = buildLexiconScheduleItem(word({}), null, "John 1:1", false, 0)
    expect(plain.label).toBe(lexiconCardLabel(word({}), "John 1:1"))
  })
})
