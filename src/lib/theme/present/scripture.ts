import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import type { PresentedSlide, ScriptureContent } from "./types"

/**
 * Present a Scripture theme with a pushed verse (themeredo.md, Phase 4).
 *
 * The scripture placeholder stays **style-only** on the slide; the live
 * {@link ScriptureContent.verse} rides alongside as `scriptureContent` for the
 * renderer to lay out at draw time (decision D2 → render-time payload). This
 * preserves the verse segments / verse numbers / styled spans that a flat
 * `verseText` string would flatten away.
 *
 * One page in → one slide out. Multi-page verses (paging / per-verse breaks) are
 * materialized by the caller invoking this once per resolved page, keeping the
 * mapper pure and paging-agnostic.
 */
export function presentScripture(
  theme: Theme,
  content: ScriptureContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  return [
    {
      slide: themeToSlide(theme, newId, now),
      scriptureContent: content.verse,
    },
  ]
}
