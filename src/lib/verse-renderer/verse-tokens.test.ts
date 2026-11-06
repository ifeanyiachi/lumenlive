import { describe, expect, it } from "vitest"
import {
  buildRenderTokens,
  usesTokenLayout,
  verseNumberStyled,
} from "./verse-tokens"
import { CLASSIC_VERSE_STYLE } from "./verse-style.fixture"
import type { VerseStyle, VerseSegment } from "@/types/broadcast"

/**
 * Covers the verse-number styling + per-verse line-break features: which verses
 * must render through the token path (vs the byte-identical plain path), and the
 * tokens `buildRenderTokens` emits for numbers and hard breaks.
 */

/** A neutral theme: number matches the body, no superscript, no per-verse break
 *  — the case that must stay on the plain path. Tests opt into styling. */
function neutralTheme(): VerseStyle {
  const t = structuredClone(CLASSIC_VERSE_STYLE)
  t.verseText.color = "#ffffff"
  t.verseNumbers = {
    visible: true,
    color: "#ffffff",
    superscript: false,
    fontSize: 20,
  }
  t.layout.breakPerVerse = false
  return t
}

const oneVerse: VerseSegment[] = [
  { verseNumber: 16, text: "For God so loved the world" },
]
const twoVerses: VerseSegment[] = [
  { verseNumber: 16, text: "For God so loved the world" },
  { verseNumber: 17, text: "For God sent not his Son" },
]

describe("verseNumberStyled", () => {
  it("is false when the number matches the body (same colour, no superscript)", () => {
    expect(verseNumberStyled(neutralTheme(), oneVerse)).toBe(false)
  })

  it("is true when the number colour differs from the body", () => {
    const t = neutralTheme()
    t.verseNumbers.color = "#ff0000"
    expect(verseNumberStyled(t, oneVerse)).toBe(true)
  })

  it("is true when the number is a superscript", () => {
    const t = neutralTheme()
    t.verseNumbers.superscript = true
    expect(verseNumberStyled(t, oneVerse)).toBe(true)
  })

  it("is false when verse numbers are hidden, even with a distinct colour", () => {
    const t = neutralTheme()
    t.verseNumbers.visible = false
    t.verseNumbers.color = "#ff0000"
    expect(verseNumberStyled(t, oneVerse)).toBe(false)
  })

  it("is false when no segment actually carries a number", () => {
    const t = neutralTheme()
    t.verseNumbers.color = "#ff0000"
    expect(verseNumberStyled(t, [{ text: "no number here" }])).toBe(false)
  })
})

describe("usesTokenLayout", () => {
  it("is false for a neutral verse (keeps the plain, byte-identical path)", () => {
    expect(usesTokenLayout(neutralTheme(), oneVerse)).toBe(false)
  })

  it("is true when breakPerVerse is on and there are 2+ verses", () => {
    const t = neutralTheme()
    t.layout.breakPerVerse = true
    expect(usesTokenLayout(t, twoVerses)).toBe(true)
  })

  it("is false when breakPerVerse is on but there is only one verse", () => {
    const t = neutralTheme()
    t.layout.breakPerVerse = true
    expect(usesTokenLayout(t, oneVerse)).toBe(false)
  })

  it("is false for interlinear verses even with spans present", () => {
    const seg: VerseSegment[] = [
      {
        text: "In (en) the beginning",
        isInterlinear: true,
        spans: [{ start: 0, end: 2, style: { bold: true } }],
      },
    ]
    expect(usesTokenLayout(neutralTheme(), seg)).toBe(false)
  })

  it("is true when a segment has styled spans", () => {
    const seg: VerseSegment[] = [
      {
        verseNumber: 1,
        text: "abc",
        spans: [{ start: 0, end: 1, style: { bold: true } }],
      },
    ]
    expect(usesTokenLayout(neutralTheme(), seg)).toBe(true)
  })
})

describe("buildRenderTokens verse numbers", () => {
  it("colours the number token and uses the superscript size when superscript is on", () => {
    const t = neutralTheme()
    t.verseNumbers.color = "#ff0000"
    t.verseNumbers.superscript = true
    t.verseNumbers.fontSize = 24
    const num = buildRenderTokens(oneVerse, t).find(
      (tk) => tk.text.trim() === "16"
    )
    expect(num).toBeDefined()
    expect(num!.color).toBe("#ff0000")
    expect(num!.fontSize).toBe(24)
  })

  it("keeps the body size (no fontSize override) when superscript is off", () => {
    const t = neutralTheme()
    t.verseNumbers.color = "#ff0000"
    const num = buildRenderTokens(oneVerse, t).find(
      (tk) => tk.text.trim() === "16"
    )
    expect(num!.color).toBe("#ff0000")
    expect(num!.fontSize).toBeUndefined()
  })

  it("inserts exactly one break token between two verses when breakPerVerse is on", () => {
    const t = neutralTheme()
    t.layout.breakPerVerse = true
    const tokens = buildRenderTokens(twoVerses, t)
    expect(tokens.filter((tk) => tk.break).length).toBe(1)
  })

  it("adds no break token for a single verse", () => {
    const t = neutralTheme()
    t.layout.breakPerVerse = true
    expect(buildRenderTokens(oneVerse, t).some((tk) => tk.break)).toBe(false)
  })
})
