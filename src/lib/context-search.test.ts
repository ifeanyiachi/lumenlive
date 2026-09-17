import { describe, it, expect, vi, afterEach } from "vitest"
import Fuse from "fuse.js"
import {
  buildFuseIndexFromRows,
  rowToDoc,
  FUSE_OPTIONS,
} from "./context-search"

type Row = {
  book_number: number
  book_name: string
  chapter: number
  verse: number
  text: string
}

// A deterministic corpus of verse-like rows, big enough to exercise the
// time-sliced build loop and varied enough that queries rank differently.
const BOOKS = [
  [1, "Genesis"],
  [19, "Psalms"],
  [43, "John"],
  [45, "Romans"],
  [66, "Revelation"],
] as const

const WORDS = [
  "light",
  "love",
  "grace",
  "faith",
  "water",
  "shepherd",
  "kingdom",
  "mercy",
  "spirit",
  "glory",
  "peace",
  "wisdom",
  "heaven",
  "righteous",
  "covenant",
  "everlasting",
]

function makeRows(count: number): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < count; i++) {
    const [bn, name] = BOOKS[i % BOOKS.length]
    // Pull 6-10 words deterministically so texts overlap the query pool but vary.
    const len = 6 + (i % 5)
    const words: string[] = []
    for (let w = 0; w < len; w++) {
      words.push(WORDS[(i * 7 + w * 13) % WORDS.length])
    }
    rows.push({
      book_number: bn,
      book_name: name,
      chapter: (i % 40) + 1,
      verse: (i % 30) + 1,
      text: words.join(" "),
    })
  }
  return rows
}

const QUERIES = [
  "light",
  "love grace",
  "faith and mercy",
  "shepherd of the kingdom",
  "everlasting covenant",
  "peace wisdom heaven",
  "righteous glory",
  "spirit water light",
  "John",
  "zzz nomatch",
]

/** Reduce Fuse results to a stable, comparable shape. */
function shape(
  results: ReturnType<Fuse<ReturnType<typeof rowToDoc>>["search"]>
) {
  return results.map((r) => ({
    ref: r.item.verse_ref,
    refIndex: r.refIndex,
    // Fuse scores are floats; round to blunt any FP noise between builds.
    score: r.score == null ? null : Number(r.score.toFixed(10)),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("buildFuseIndexFromRows", () => {
  it("produces search results identical to a one-shot new Fuse() build", async () => {
    const rows = makeRows(500)

    const oneShot = new Fuse(rows.map(rowToDoc), FUSE_OPTIONS)
    const incremental = await buildFuseIndexFromRows(rows)

    for (const q of QUERIES) {
      const expected = shape(oneShot.search(q))
      const actual = shape(incremental.search(q))
      expect(actual, `query: "${q}"`).toEqual(expected)
    }
  })

  it("stays byte-identical even when the build is forced to yield mid-way", async () => {
    const rows = makeRows(500)
    const oneShot = new Fuse(rows.map(rowToDoc), FUSE_OPTIONS)

    // Force the time-slice check to exceed the budget on every probe so the
    // cooperative-yield branch runs repeatedly during the build.
    let t = 0
    vi.spyOn(performance, "now").mockImplementation(() => {
      t += 1000
      return t
    })

    const incremental = await buildFuseIndexFromRows(rows)

    for (const q of QUERIES) {
      expect(shape(incremental.search(q)), `query: "${q}"`).toEqual(
        shape(oneShot.search(q))
      )
    }
  })

  it("indexes every row (limit-bounded results match the one-shot build)", async () => {
    const rows = makeRows(120)
    const oneShot = new Fuse(rows.map(rowToDoc), FUSE_OPTIONS)
    const incremental = await buildFuseIndexFromRows(rows)

    const expected = shape(oneShot.search("light", { limit: 15 }))
    const actual = shape(incremental.search("light", { limit: 15 }))
    expect(actual).toEqual(expected)
    expect(actual.length).toBeGreaterThan(0)
  })
})
