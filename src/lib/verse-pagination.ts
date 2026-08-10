import type {
  BroadcastTheme,
  VerseRenderData,
  VerseSegment,
} from "@/types/broadcast"
import {
  measureVerseHeightAtFont,
  computeVerseTextBox,
} from "@/lib/verse-renderer/layout"

/**
 * Split a long multi-verse block into readable pages.
 *
 * Auto-fit shrinks a verse to fit its box, but a long passage (e.g. 5 verses at
 * once) would shrink to unreadable — or, past the floor, clip. Pagination is the
 * answer: when the whole block won't fit at the readable minimum, split it into
 * pages the operator steps through, each of which still auto-fits per output.
 *
 * Splitting is computed once at the theme's authored resolution (surface-
 * independent, so page breaks are stable across monitors) and only at verse
 * (segment) boundaries, so verse numbers stay intact. A single verse taller than
 * the box is left whole — auto-fit handles it (over-shrinking at worst) rather
 * than breaking mid-verse.
 *
 * Each page keeps the block's combined `reference` (per-page reference narrowing
 * would need book/chapter metadata the segment list doesn't carry).
 */

export interface PaginateOptions {
  /** Design-space px floor: a block that won't fit at this size is paginated. */
  minFontSize: number
  /** When false, never paginate (returns the block unchanged). */
  enabled: boolean
}

/** Offscreen 2D context for text measurement (app window has the fonts). */
function offscreenContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null
  return document.createElement("canvas").getContext("2d")
}

export function paginateVerse(
  verse: VerseRenderData,
  theme: BroadcastTheme,
  options: PaginateOptions,
  ctxOverride?: CanvasRenderingContext2D
): VerseRenderData[] {
  if (!options.enabled || verse.segments.length <= 1) return [verse]

  const ctx = ctxOverride ?? offscreenContext()
  if (!ctx) return [verse] // no canvas (e.g. headless) → can't measure; don't split

  const { textRectW, availableVerseHeight } = computeVerseTextBox(theme)
  const fits = (segs: VerseSegment[]): boolean =>
    measureVerseHeightAtFont(
      ctx,
      theme,
      { ...verse, segments: segs },
      textRectW,
      options.minFontSize
    ) <= availableVerseHeight

  // Whole block already fits at the readable floor → single page (auto-fit sizes it).
  if (fits(verse.segments)) return [verse]

  const pages: VerseRenderData[] = []
  let current: VerseSegment[] = []
  for (const seg of verse.segments) {
    if (current.length > 0 && !fits([...current, seg])) {
      pages.push({ ...verse, segments: current })
      current = [seg]
    } else {
      current = [...current, seg]
    }
  }
  if (current.length > 0) pages.push({ ...verse, segments: current })
  return pages.length > 0 ? pages : [verse]
}
