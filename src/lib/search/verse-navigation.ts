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

/**
 * Result of stepping `count` verses from the current selection.
 *
 * Same shape as [`VerseStep`], but the `cross-chapter` variant also carries
 * `remaining` — how many *more* steps to take once the caller has loaded the
 * adjacent chapter and landed on its edge verse. The caller drives the loop:
 * load the chapter, land on the edge, then call [`stepVerseBy`] again with
 * `remaining` from that edge verse. `remaining` is 0 when the edge verse is the
 * final target.
 */
export type VerseStepN =
  | { kind: "verse"; verse: Verse }
  | {
      kind: "cross-chapter"
      bookNumber: number
      chapter: number
      edge: "first" | "last"
      remaining: number
    }
  | { kind: "none" }

/**
 * Step `count` verses from `selected` within `currentChapter`.
 *
 * Generalises [`stepVerse`] to multi-verse jumps ("skip the next two verses").
 * When the jump lands inside the loaded chapter it resolves directly; when it
 * runs off either end it returns `cross-chapter` with the `remaining` steps so
 * the caller can continue in the next chapter (see [`VerseStepN`]). A backward
 * overshoot within chapter 1 clamps to verse 1 rather than reporting `none`, so
 * a too-large "back N" still lands somewhere sensible.
 */
export function stepVerseBy(
  selected: Verse | null,
  currentChapter: Verse[],
  direction: NavDirection,
  count: number
): VerseStepN {
  if (!selected) return { kind: "none" }

  const steps = Math.max(1, Math.trunc(count))

  const idx = currentChapter.findIndex(
    (v) =>
      v.book_number === selected.book_number &&
      v.chapter === selected.chapter &&
      v.verse === selected.verse
  )
  if (idx === -1) return { kind: "none" }

  if (direction === "next") {
    const target = idx + steps
    const verse = currentChapter[target]
    if (verse) return { kind: "verse", verse }
    // Overflow: land on the next chapter's first verse (one step past the last
    // verse of this one), carrying any leftover steps into it.
    const stepsToEnd = currentChapter.length - 1 - idx
    return {
      kind: "cross-chapter",
      bookNumber: selected.book_number,
      chapter: selected.chapter + 1,
      edge: "first",
      remaining: steps - stepsToEnd - 1,
    }
  }

  // previous
  const target = idx - steps
  if (target >= 0) return { kind: "verse", verse: currentChapter[target] }
  // Underflow. In chapter 1 there is no earlier chapter — clamp to verse 1
  // (or nothing if already there).
  if (selected.chapter <= 1) {
    return idx > 0
      ? { kind: "verse", verse: currentChapter[0] }
      : { kind: "none" }
  }
  return {
    kind: "cross-chapter",
    bookNumber: selected.book_number,
    chapter: selected.chapter - 1,
    edge: "last",
    remaining: steps - idx - 1,
  }
}
