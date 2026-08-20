import type {
  BroadcastTheme,
  RenderOptions,
  VerseRenderData,
} from "@/types/broadcast"
import type { Slide, SlideScriptureElement } from "@/types/slide"
import type { Theme } from "@/types/theme"
import {
  scriptureElementToVerseStyle,
  type ScriptureRenderPayload,
} from "@/lib/slide-renderer"
import { themeToSlide } from "@/lib/theme/render"

/**
 * Presented-slide builder for live scripture on the output compositor (themeredo.md,
 * flip F5).
 *
 * The live scripture flip renders the verse/reference through the **slide** renderer's
 * scripture-payload path (`drawScriptureElement` → `drawScriptureVersePayload`) instead
 * of `renderVerse`'s own verse pass — the two are byte-identical (proven by the
 * scripture parity gate and this module's colocated parity test). The compositor keeps
 * painting the theme **chrome** (background + text box + decorations) through
 * `renderVerse(theme, null, …)` — the exact same pass, minus the verse/reference draw —
 * so only the verse *content* moves onto the slide path; the backdrop stays byte-for-byte.
 *
 * This module produces the two things the slide-path foreground draw needs:
 *   - a one-element {@link Slide} carrying a style-only scripture placeholder, and
 *   - the `scriptureContent` payload map (`{ verse, style, options }`) keyed by that
 *     element's id — the live verse + the theme's verse typography + the auto-fit knobs.
 *
 * The placeholder element is a pure **carrier**: under the payload path
 * `drawScriptureElement` ignores the element's own box/typography entirely and lays the
 * verse out against the draw surface from the payload `style` (a `BroadcastTheme`) — so
 * the element's geometry is inert and its only load-bearing fields are `type` and `id`.
 * Built from `theme.verseText` regardless of the theme's category, so a verse always has
 * a carrier even when the source theme is not scripture-categorised (matching
 * `renderVerse`, which draws the pushed verse for any theme).
 *
 * Not pure (module-level memo), by design — the same shape {@link import("./countdown-slide")}
 * uses. The compositor calls this every RAF frame; the result only changes when the
 * theme, verse, or auto-fit settings change (not per frame), so it is memoised on exactly
 * those and returns the cached object otherwise — no allocation in the steady-state draw
 * loop (perf rule 1). {@link resetScriptureSlideCache} clears it (tests).
 */

/** Auto-fit settings carried from the output onto the verse layout. */
export interface ScriptureAutoFit {
  verseAutoFit: boolean
  maxVerseScale: number
  minVerseFontSize: number
}

/** The scripture carrier's element id — the key the payload map is stored under. */
const SCRIPTURE_ELEMENT_ID = "live-scripture"

export interface ScripturePresentation {
  slide: Slide
  scriptureContent: Map<string, ScriptureRenderPayload>
}

interface CacheEntry extends ScriptureAutoFit {
  theme: BroadcastTheme
  verse: VerseRenderData
  result: ScripturePresentation
}

let cached: CacheEntry | null = null

/**
 * A style-only scripture placeholder carrying the theme's verse typography. Its
 * geometry/typography are inert under the payload path (see the module doc); the
 * fields are populated faithfully so the element is a valid {@link SlideScriptureElement}
 * and would still render sensibly if the payload were ever absent.
 */
function scriptureCarrier(theme: BroadcastTheme): SlideScriptureElement {
  const vt = theme.verseText
  return {
    id: SCRIPTURE_ELEMENT_ID,
    type: "scripture",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    reference: "",
    verseText: "",
    translation: "",
    fontFamily: vt.fontFamily,
    fontSize: vt.fontSize,
    fontWeight: vt.fontWeight,
    bold: vt.fontWeight >= 600,
    italic: vt.fontStyle === "italic",
    color: vt.color,
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: vt.lineHeight,
    referenceFontSize: theme.reference.fontSize,
    referenceColor: theme.reference.color,
  }
}

function build(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  autoFit: ScriptureAutoFit
): ScripturePresentation {
  const element = scriptureCarrier(theme)
  const slide: Slide = {
    id: SCRIPTURE_ELEMENT_ID,
    name: "live-scripture",
    // Transparent so a stray call to `renderSlide` would not paint over the chrome;
    // the compositor draws the elements directly with `drawSlideElements` regardless.
    background: { type: "transparent" },
    elements: [element],
    createdAt: 0,
    updatedAt: 0,
  }
  // The verse rides as a render-time payload (decision D2): style-only element on the
  // slide, live verse + verse typography (`style`) + auto-fit options alongside. `surface`
  // is omitted — the renderer derives it from the draw canvas so one payload renders at
  // any output resolution (Phase 4c). `frameTime`/`imageCache` are inert for the verse
  // text layout and left off so the memo key is not perturbed per frame.
  const options: Omit<RenderOptions, "surface"> = {
    scale: 1,
    verseAutoFit: autoFit.verseAutoFit,
    maxVerseScale: autoFit.maxVerseScale,
    minVerseFontSize: autoFit.minVerseFontSize,
  }
  const scriptureContent = new Map<string, ScriptureRenderPayload>([
    [element.id, { verse, style: theme, options }],
  ])
  return { slide, scriptureContent }
}

/**
 * The presented scripture slide + payload for a live verse, ready for the compositor's
 * slide-path foreground draw. Memoised on `(theme, verse, auto-fit)` so per-frame redraws
 * reuse the same object.
 */
export function buildScriptureSlide(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  autoFit: ScriptureAutoFit
): ScripturePresentation {
  if (
    cached &&
    cached.theme === theme &&
    cached.verse === verse &&
    cached.verseAutoFit === autoFit.verseAutoFit &&
    cached.maxVerseScale === autoFit.maxVerseScale &&
    cached.minVerseFontSize === autoFit.minVerseFontSize
  ) {
    return cached.result
  }
  const result = build(theme, verse, autoFit)
  cached = { theme, verse, ...autoFit, result }
  return result
}

/** Clear the memo (tests, and on teardown). */
export function resetScriptureSlideCache(): void {
  cached = null
  contentCached = null
  baseCached = null
}

// ── Base backdrop on the slide path (flip RF3a / decision D1) ─────────────────
// The central base/master backdrop is now a `Theme`, painted through the slide
// renderer (background + decorative elements, no content — its scripture placeholder,
// if any, is style-only and draws nothing). This projects it to a renderable slide,
// memoised per theme so the RAF hot path allocates nothing in steady state.

let baseCached: { theme: Theme; slide: Slide } | null = null

/** The renderable slide for the base backdrop `Theme`. Memoised on theme identity. */
export function buildBaseSlide(theme: Theme): Slide {
  if (baseCached && baseCached.theme === theme) return baseCached.slide
  const slide = themeToSlide(theme, () => "base-theme")
  baseCached = { theme, slide }
  return slide
}

// ── Live scripture on the slide path (flip RF2) ──────────────────────────────
// The renderer Theme-object flip routes a live verse through the slide renderer: the
// presented scripture slide (built by `presentScripture` in the store) carries a
// style-only scripture placeholder, and the pushed verse rides alongside on the wire.
// The compositor draws the slide through `renderSlide` and hands the verse to that
// placeholder as a `scriptureContent` payload, whose `style` is rebuilt from the
// placeholder's own (RF1-enriched) styling via `scriptureElementToVerseStyle` — no
// pushed BroadcastTheme required. This is the builder for that payload map.

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
