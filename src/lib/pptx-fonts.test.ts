import { describe, it, expect } from "vitest"
import type { Presentation, Slide, SlideTextElement } from "@/types/slide"
import {
  applyFontSubstitutions,
  collectFontFamilies,
  countElementsUsingFont,
  findUnmatchedFonts,
  normalizeFamily,
  suggestReplacement,
} from "./pptx-fonts"

// ── Fixtures ─────────────────────────────────────────────────────────────────

function textEl(over: Partial<SlideTextElement>): SlideTextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text: "Hello",
    x: 10,
    y: 10,
    width: 50,
    height: 20,
    fontFamily: "Calibri",
    fontSize: 40,
    fontWeight: 400,
    bold: false,
    italic: false,
    underline: false,
    color: "#ffffff",
    horizontalAlign: "left",
    verticalAlign: "top",
    lineHeight: 1.2,
    textTransform: "none",
    ...over,
  }
}

function pres(...elements: SlideTextElement[]): Presentation {
  const slide: Slide = {
    id: crypto.randomUUID(),
    name: "Slide 1",
    background: { type: "solid", color: "#000000" },
    elements,
    createdAt: 0,
    updatedAt: 0,
  }
  return {
    id: crypto.randomUUID(),
    name: "Deck",
    slides: [slide],
    createdAt: 0,
    updatedAt: 0,
  }
}

// ── collectFontFamilies ──────────────────────────────────────────────────────

describe("collectFontFamilies", () => {
  it("returns distinct families in first-seen order, original casing", () => {
    const p = pres(
      textEl({ fontFamily: "Calibri" }),
      textEl({ fontFamily: "calibri" }),
      textEl({ fontFamily: "Cambria" })
    )
    expect(collectFontFamilies(p)).toEqual(["Calibri", "Cambria"])
  })

  it("ignores blank families", () => {
    const p = pres(textEl({ fontFamily: "  " }), textEl({ fontFamily: "Arial" }))
    expect(collectFontFamilies(p)).toEqual(["Arial"])
  })
})

// ── findUnmatchedFonts ───────────────────────────────────────────────────────

describe("findUnmatchedFonts", () => {
  it("flags only families with no available match (case-insensitive)", () => {
    const unmatched = findUnmatchedFonts(
      ["Calibri", "Inter", "Brand Sans"],
      ["inter", "Arial"]
    )
    expect(unmatched).toEqual(["Calibri", "Brand Sans"])
  })
})

// ── countElementsUsingFont ───────────────────────────────────────────────────

describe("countElementsUsingFont", () => {
  it("counts elements per family case-insensitively", () => {
    const p = pres(
      textEl({ fontFamily: "Calibri" }),
      textEl({ fontFamily: "CALIBRI" }),
      textEl({ fontFamily: "Cambria" })
    )
    expect(countElementsUsingFont(p, "calibri")).toBe(2)
    expect(countElementsUsingFont(p, "Cambria")).toBe(1)
  })
})

// ── suggestReplacement ───────────────────────────────────────────────────────

describe("suggestReplacement", () => {
  it("uses a curated match when available", () => {
    expect(suggestReplacement("Calibri", ["Inter", "Arial"])).toBe("Inter")
    expect(suggestReplacement("Cambria", ["Source Serif 4", "Inter"])).toBe(
      "Source Serif 4"
    )
  })

  it("falls back to Inter, then the first available", () => {
    expect(suggestReplacement("Weird Font", ["Inter", "Arial"])).toBe("Inter")
    expect(suggestReplacement("Weird Font", ["Arial", "Georgia"])).toBe("Arial")
  })
})

// ── applyFontSubstitutions ───────────────────────────────────────────────────

describe("applyFontSubstitutions", () => {
  it("replaces family and scales size, leaving other styles untouched", () => {
    const p = pres(textEl({ fontFamily: "Calibri", fontSize: 40, color: "#abc" }))
    const out = applyFontSubstitutions(
      p,
      new Map([[normalizeFamily("Calibri"), { family: "Inter", scale: 1.25 }]])
    )
    const el = out.slides[0].elements[0] as SlideTextElement
    expect(el.fontFamily).toBe("Inter")
    expect(el.fontSize).toBe(50)
    // Everything else preserved.
    expect(el.color).toBe("#abc")
    expect(el.x).toBe(10)
    expect(el.horizontalAlign).toBe("left")
  })

  it("leaves unmapped families untouched (same reference)", () => {
    const p = pres(textEl({ fontFamily: "Cambria" }))
    const out = applyFontSubstitutions(
      p,
      new Map([[normalizeFamily("Calibri"), { family: "Inter", scale: 1 }]])
    )
    expect(out.slides[0].elements[0]).toBe(p.slides[0].elements[0])
  })

  it("returns the input unchanged when there are no substitutions", () => {
    const p = pres(textEl({}))
    expect(applyFontSubstitutions(p, new Map())).toBe(p)
  })

  it("does not mutate the input presentation", () => {
    const p = pres(textEl({ fontFamily: "Calibri", fontSize: 40 }))
    applyFontSubstitutions(
      p,
      new Map([[normalizeFamily("Calibri"), { family: "Inter", scale: 2 }]])
    )
    const el = p.slides[0].elements[0] as SlideTextElement
    expect(el.fontFamily).toBe("Calibri")
    expect(el.fontSize).toBe(40)
  })
})
