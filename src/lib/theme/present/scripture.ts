import type { VerseRenderData } from "@/types/broadcast"
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
 * One page in → one slide out. Multi-page verses are materialized by
 * {@link presentScripturePages}; this single-page entry point delegates to it.
 */
export function presentScripture(
  theme: Theme,
  content: ScriptureContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  return presentScripturePages(theme, [content.verse], newId, now)
}

/**
 * Materialize a **paged** scripture push into one presented slide per page
 * (themeredo.md, flip F4).
 *
 * A long multi-verse block is split upstream — by `resolveVersePages` /
 * `paginateVerse` — into readable pages at verse (segment) boundaries, each a
 * {@link VerseRenderData} carrying that page's subset of segments (the combined
 * reference is kept on every page). This maps each page onto the scripture theme,
 * so stepping pages steps slides. A single-page push (`pages.length === 1`, i.e.
 * an unpaginated verse) yields exactly one slide.
 *
 * The split itself is not done here — it is a text-measurement fact the caller
 * resolves against the output's readable floor (surface-independent, stable
 * across monitors) and hands in already-paged, keeping this mapper pure and
 * paging-agnostic. Each page stays **style-only** on the slide and rides its
 * verse as a render-time payload (decision D2), so per-page byte-parity with
 * `renderVerse` is exactly what the scripture parity gate proves — paging does
 * not introduce a new render path, only more of the same one.
 *
 * PURE: `themeToSlide` deep-clones per page, so the source theme is never mutated
 * and pages never share element identity.
 */
export function presentScripturePages(
  theme: Theme,
  pages: readonly VerseRenderData[],
  newId: () => string,
  now = 0
): PresentedSlide[] {
  return pages.map((verse) => {
    const slide = themeToSlide(theme, newId, now)
    // The live verse rides as `scriptureContent`; strip any authoring sample text
    // from the scripture placeholder so the presented slide stays style-only
    // (decision D2 — the payload is authoritative for content).
    const elements = slide.elements.map((el) =>
      el.type === "scripture"
        ? { ...el, reference: "", verseText: "", translation: "" }
        : el
    )
    return { slide: { ...slide, elements }, scriptureContent: verse }
  })
}
