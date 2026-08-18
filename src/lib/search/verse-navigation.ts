import type { Verse } from "@/types"

/** Direction of a spoken navigation command (mirrors the backend `NavDirection`). */
export type NavDirection = "next" | "previous"

/**
 * Result of stepping one verse from the current selection.
 *
 * - `verse`: the neighbour is inside the loaded chapter — present it directly.
 * - `cross-chapter`: the step falls off the start/end of the loaded chapter, so
 *   the caller must load `bookNumber`/`chapter` and select its `edge` verse
 *   ("first" for a forward roll-over, "last" for a backward one).
 * - `none`: nothing to do — no selection, the selection isn't in the loaded
 *   chapter, or a backward step from the very first verse of chapter 1.
 */
export type VerseStep =
  | { kind: "verse"; verse: Verse }
  | {
      kind: "cross-chapter"
      bookNumber: number
      chapter: number
      edge: "first" | "last"
    }
  | { kind: "none" }

/**
 * Compute the verse one step away from `selected` within `currentChapter`.
 *
 * The anchor is the currently-selected verse — whatever is on the program
 * screen, regardless of how it got there (spoken reference, manual pick, queue
 * take, reading mode) — so voice navigation follows the live selection rather
 * than the last thing the detector *heard*.
 *
 * Matching is by book/chapter/verse coordinates, never by `id`: verses
 * synthesised from a detection carry `id: 0`, while the loaded `currentChapter`
 * rows carry real database ids, so an id comparison would never line up.
 *
 * When the step falls off either end of the loaded chapter, a `cross-chapter`
 * result names the adjacent chapter and which end to land on; the caller loads
 * it and (if it exists) selects the edge verse. A backward step from chapter 1
 * verse 1 has nowhere to go and returns `none`.
 */
export function stepVerse(
  selected: Verse | null,
  currentChapter: Verse[],
  direction: NavDirection
): VerseStep {
  if (!selected) return { kind: "none" }

  const idx = currentChapter.findIndex(
    (v) =>
      v.book_number === selected.book_number &&
      v.chapter === selected.chapter &&
      v.verse === selected.verse
  )
  if (idx === -1) return { kind: "none" }

  if (direction === "next") {
    const next = currentChapter[idx + 1]
    if (next) return { kind: "verse", verse: next }
    return {
      kind: "cross-chapter",
      bookNumber: selected.book_number,
      chapter: selected.chapter + 1,
      edge: "first",
    }
  }

  // previous
  const prev = currentChapter[idx - 1]
  if (prev) return { kind: "verse", verse: prev }
  if (selected.chapter <= 1) return { kind: "none" }
  return {
    kind: "cross-chapter",
    bookNumber: selected.book_number,
    chapter: selected.chapter - 1,
    edge: "last",
  }
}
