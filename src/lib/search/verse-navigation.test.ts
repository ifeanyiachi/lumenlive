import { describe, it, expect } from "vitest"
import { stepVerse, stepVerseBy } from "./verse-navigation"
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

const chapter3long = [
  verse(3, 1),
  verse(3, 2),
  verse(3, 3),
  verse(3, 4),
  verse(3, 5),
]

describe("stepVerseBy", () => {
  it("steps forward N within the loaded chapter", () => {
    const r = stepVerseBy(verse(3, 1), chapter3long, "next", 2)
    expect(r).toEqual({ kind: "verse", verse: verse(3, 3) })
  })

  it("steps backward N within the loaded chapter", () => {
    const r = stepVerseBy(verse(3, 5), chapter3long, "previous", 3)
    expect(r).toEqual({ kind: "verse", verse: verse(3, 2) })
  })

  it("count of 1 matches a single step", () => {
    expect(stepVerseBy(verse(3, 2), chapter3long, "next", 1)).toEqual({
      kind: "verse",
      verse: verse(3, 3),
    })
  })

  it("clamps a non-positive count up to 1", () => {
    expect(stepVerseBy(verse(3, 2), chapter3long, "next", 0)).toEqual({
      kind: "verse",
      verse: verse(3, 3),
    })
  })

  it("lands exactly on the next chapter's first verse with 0 remaining", () => {
    // From 3:3 (index 2) stepping +2 lands on 3:5; +3 lands one past the end.
    const r = stepVerseBy(verse(3, 3), chapter3long, "next", 3)
    expect(r).toEqual({
      kind: "cross-chapter",
      bookNumber: 43,
      chapter: 4,
      edge: "first",
      remaining: 0,
    })
  })

  it("carries leftover steps into the next chapter", () => {
    // From 3:4 (index 3), +4 = last(+1) then 2 more → remaining 2.
    const r = stepVerseBy(verse(3, 4), chapter3long, "next", 4)
    expect(r).toEqual({
      kind: "cross-chapter",
      bookNumber: 43,
      chapter: 4,
      edge: "first",
      remaining: 2,
    })
  })

  it("carries leftover steps into the previous chapter", () => {
    // From 3:2 (index 1), -3 = first(-1) then 1 more back → remaining 1.
    const r = stepVerseBy(verse(3, 2), chapter3long, "previous", 3)
    expect(r).toEqual({
      kind: "cross-chapter",
      bookNumber: 43,
      chapter: 2,
      edge: "last",
      remaining: 1,
    })
  })

  it("clamps a backward overshoot in chapter 1 to verse 1", () => {
    const c1 = [verse(1, 1), verse(1, 2), verse(1, 3)]
    expect(stepVerseBy(verse(1, 3), c1, "previous", 10)).toEqual({
      kind: "verse",
      verse: verse(1, 1),
    })
  })

  it("returns none stepping back from chapter 1 verse 1", () => {
    const c1 = [verse(1, 1), verse(1, 2)]
    expect(stepVerseBy(verse(1, 1), c1, "previous", 3)).toEqual({
      kind: "none",
    })
  })

  it("returns none when there is no selection", () => {
    expect(stepVerseBy(null, chapter3long, "next", 2)).toEqual({
      kind: "none",
    })
  })
})
