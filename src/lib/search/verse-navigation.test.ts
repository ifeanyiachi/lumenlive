import { describe, it, expect } from "vitest"
import { stepVerse } from "./verse-navigation"
import type { Verse } from "@/types"

function verse(chapter: number, v: number, id = chapter * 1000 + v): Verse {
  return {
    id,
    translation_id: 1,
    book_number: 43,
    book_name: "John",
    book_abbreviation: "Jn",
    chapter,
    verse: v,
    text: `John ${chapter}:${v}`,
  }
}

const chapter3 = [verse(3, 1), verse(3, 2), verse(3, 3)]

describe("stepVerse", () => {
  it("steps forward within the loaded chapter", () => {
    const r = stepVerse(verse(3, 1), chapter3, "next")
    expect(r).toEqual({ kind: "verse", verse: verse(3, 2) })
  })

  it("steps backward within the loaded chapter", () => {
    const r = stepVerse(verse(3, 3), chapter3, "previous")
    expect(r).toEqual({ kind: "verse", verse: verse(3, 2) })
  })

  it("matches the anchor by coordinates, not id (detection verses carry id 0)", () => {
    const detected = { ...verse(3, 2), id: 0 }
    const r = stepVerse(detected, chapter3, "next")
    expect(r).toEqual({ kind: "verse", verse: verse(3, 3) })
  })

  it("rolls over to the next chapter's first verse past the end", () => {
    const r = stepVerse(verse(3, 3), chapter3, "next")
    expect(r).toEqual({
      kind: "cross-chapter",
      bookNumber: 43,
      chapter: 4,
      edge: "first",
    })
  })

  it("rolls over to the previous chapter's last verse before the start", () => {
    const r = stepVerse(verse(3, 1), chapter3, "previous")
    expect(r).toEqual({
      kind: "cross-chapter",
      bookNumber: 43,
      chapter: 2,
      edge: "last",
    })
  })

  it("returns none stepping back from chapter 1 verse 1", () => {
    const c1 = [verse(1, 1), verse(1, 2)]
    expect(stepVerse(verse(1, 1), c1, "previous")).toEqual({ kind: "none" })
  })

  it("returns none when there is no selection", () => {
    expect(stepVerse(null, chapter3, "next")).toEqual({ kind: "none" })
  })

  it("returns none when the selection is not in the loaded chapter", () => {
    const other = { ...verse(9, 9), chapter: 9, verse: 9 }
    expect(stepVerse(other, chapter3, "next")).toEqual({ kind: "none" })
  })
})
