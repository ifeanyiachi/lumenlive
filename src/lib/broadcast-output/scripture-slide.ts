import type { VerseRenderData } from "@/types/broadcast"
import type { Slide, SlideScriptureElement } from "@/types/slide"
import type { Theme } from "@/types/theme"
import {
  scriptureElementToVerseStyle,
  type ScriptureRenderPayload,
} from "@/lib/slide-renderer"
import { themeToSlide } from "@/lib/theme/render"

/**
 * Slide-path builders for the live output compositor: the base backdrop slide and
 * the live-scripture payload map. Both are memoised (module-level) — the compositor
 * calls them every RAF frame, and the result only changes when the theme/slide/verse
 * changes, so the steady-state draw loop allocates nothing (perf rule 1).
 * {@link resetScriptureSlideCache} clears the memos (tests / teardown).
 */

/** Auto-fit settings carried from the output onto the verse layout. */
export interface ScriptureAutoFit {
  verseAutoFit: boolean
  maxVerseScale: number
  minVerseFontSize: number
}

/** Clear the memos (tests, and on teardown). */
export function resetScriptureSlideCache(): void {
  contentCached = null
  baseCached = null
}

// ── Base backdrop on the slide path (flip RF3a / decision D1) ─────────────────
// The central base/master backdrop is a `Theme`, painted through the slide renderer
// (background + decorative elements, no content — its scripture placeholder, if any,
// is style-only and draws nothing). This projects it to a renderable slide, memoised
// per theme so the RAF hot path allocates nothing in steady state.

let baseCached: { theme: Theme; slide: Slide } | null = null

/** The renderable slide for the base backdrop `Theme`. Memoised on theme identity. */
export function buildBaseSlide(theme: Theme): Slide {
  if (baseCached && baseCached.theme === theme) return baseCached.slide
  const slide = themeToSlide(theme, () => "base-theme")
  baseCached = { theme, slide }
  return slide
}

// ── Live scripture on the slide path (flip RF2) ──────────────────────────────
// A live verse renders through the slide renderer: the presented scripture slide
// (built by `presentScripture` in the store) carries a style-only scripture
// placeholder, and the pushed verse rides alongside on the wire. The compositor draws
// the slide through `renderSlide` and hands the verse to that placeholder as a
// `scriptureContent` payload, whose `style` is rebuilt from the placeholder's own
// (RF1-enriched) styling via `scriptureElementToVerseStyle`. This is the builder for
// that payload map.

interface ContentCacheEntry extends ScriptureAutoFit {
  slide: Slide
  verse: VerseRenderData
  map: Map<string, ScriptureRenderPayload>
}

let contentCached: ContentCacheEntry | null = null

/**
 * The `scriptureContent` payload map for a presented scripture slide + live verse,
 * keyed by the slide's scripture placeholder id. Empty when the slide has no scripture
 * element. Memoised on `(slide, verse, auto-fit)` so per-frame redraws reuse it.
 */
export function buildScriptureContent(
  slide: Slide,
  verse: VerseRenderData,
  autoFit: ScriptureAutoFit
): Map<string, ScriptureRenderPayload> {
  if (
    contentCached &&
    contentCached.slide === slide &&
    contentCached.verse === verse &&
    contentCached.verseAutoFit === autoFit.verseAutoFit &&
    contentCached.maxVerseScale === autoFit.maxVerseScale &&
    contentCached.minVerseFontSize === autoFit.minVerseFontSize
  ) {
    return contentCached.map
  }
  const el = slide.elements.find((e) => e.type === "scripture") as
    | SlideScriptureElement
    | undefined
  const map = new Map<string, ScriptureRenderPayload>()
  if (el) {
    map.set(el.id, {
      verse,
      style: scriptureElementToVerseStyle(el),
      options: {
        scale: 1,
        verseAutoFit: autoFit.verseAutoFit,
        maxVerseScale: autoFit.maxVerseScale,
        minVerseFontSize: autoFit.minVerseFontSize,
      },
    })
  }
  contentCached = { slide, verse, ...autoFit, map }
  return map
}
