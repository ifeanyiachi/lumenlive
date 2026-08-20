import type {
  BroadcastTheme,
  RenderOptions,
  VerseRenderData,
} from "@/types/broadcast"
import type { Slide, SlideScriptureElement } from "@/types/slide"
import type { ScriptureRenderPayload } from "@/lib/slide-renderer"
import { renderVerse } from "@/lib/verse-renderer"
import { renderSlide } from "@/lib/slide-renderer"
import { fontPx, recordingCtx, type TextDraw } from "./recording-ctx"

/**
 * Scripture parity harness (themeredo.md, Phase 4).
 *
 * Drives the reference path (`renderVerse` over a `BroadcastTheme`) and the
 * candidate path (`renderSlide` over a style-only scripture placeholder carrying
 * the verse as a render-time payload) through one recording context, then reports
 * the concrete places their text output diverges. It is the *instrument* the verse
 * → slide flip is gated on. As of Phase 4c the divergence set is **empty** across
 * the scripture built-ins — including under auto-fit and surface scaling — because
 * the slide path runs the identical verse layout (`computeVerseLayoutMetrics`) and
 * draw passes. A divergence firing now is a real regression, not a documented gap.
 *
 * This is a harness fixture, not the production content path — the mappers in
 * `../` carry live scripture as a render-time payload (decision D2); the
 * element-swap flatten here exists precisely to *measure* what that flatten
 * would lose if it were used instead.
 */

const RENDER_W = 1920
const RENDER_H = 1080

/** What a single render path produced, distilled to the parity-relevant facts. */
export interface RenderFacts {
  /** Every drawn string, in order. */
  texts: string[]
  /** The largest font size drawn (the verse body). */
  bodyFontPx: number | null
  /** Distinct font sizes drawn, ascending. */
  fontSizes: number[]
  /** The verse body: the body-font draws joined, whitespace-collapsed. */
  bodyText: string
  /** A drawn string that looks like the reference label, if any. */
  referenceText: string | null
}

export interface ScriptureParityReport {
  themeId: string
  reference: string
  verse: RenderFacts
  slide: RenderFacts
  /** Human-readable list of the concrete divergences found. */
  divergences: string[]
}

/** Flatten rich verse segments to the flat strings a scripture element holds. */
export function flattenVerse(verse: VerseRenderData): {
  verseText: string
  reference: string
} {
  return {
    verseText: verse.segments.map((s) => s.text).join(" "),
    reference: verse.reference,
  }
}

/**
 * Derive a scripture placeholder styled to match a broadcast theme's verse text,
 * spanning most of the frame. Used only by the harness to put the two paths on
 * comparable typography.
 */
export function scriptureElementFromTheme(
  theme: BroadcastTheme
): SlideScriptureElement {
  const vt = theme.verseText
  return {
    id: "parity-scripture",
    type: "scripture",
    x: 5,
    y: 10,
    width: 90,
    height: 80,
    reference: "",
    verseText: "",
    translation: "",
    fontFamily: vt.fontFamily,
    fontSize: vt.fontSize,
    fontWeight: vt.fontWeight,
    bold: vt.fontWeight >= 600,
    italic: vt.fontStyle === "italic",
    color: vt.color,
    horizontalAlign: theme.layout.textAlign,
    verticalAlign: "middle",
    lineHeight: vt.lineHeight,
    referenceFontSize: theme.reference.fontSize,
    referenceColor: theme.reference.color,
  }
}

/** Collapse runs of whitespace and trim — verse text is drawn token-by-token. */
function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function analyze(draws: TextDraw[]): RenderFacts {
  const texts = draws.map((d) => d.text)
  const sizes = draws
    .map((d) => fontPx(d.font))
    .filter((n): n is number => n != null)
  const bodyFontPx = sizes.length ? Math.max(...sizes) : null
  const fontSizes = [...new Set(sizes)].sort((a, b) => a - b)
  // The verse body is everything drawn at the body font size; joined and
  // whitespace-collapsed it is comparable whether the renderer drew it as one
  // line or token-by-token.
  const bodyText = collapse(
    draws
      .filter((d) => fontPx(d.font) === bodyFontPx)
      .map((d) => d.text)
      .join(" ")
  )
  // The reference is a smaller-font draw (below the body size) — pick the last
  // such draw, matching how both renderers place the reference after the verse.
  const refDraw = [...draws]
    .reverse()
    .find((d) => (fontPx(d.font) ?? 0) < (bodyFontPx ?? 0))
  return {
    texts,
    bodyFontPx,
    fontSizes,
    bodyText,
    referenceText: refDraw ? refDraw.text : null,
  }
}

/** Run `renderVerse` and collect its text facts. */
export function verseFacts(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  options?: RenderOptions
): RenderFacts {
  const { ctx, draws } = recordingCtx()
  renderVerse(ctx, theme, verse, options)
  return analyze(draws)
}

/**
 * Run `renderSlide` over a scripture placeholder. With a `payload` the element
 * carries the live verse as a render-time payload (decision D2) and the slide
 * path delegates to the verse-renderer draw passes; without one it renders the
 * element's stored flat strings (the legacy, byte-identical path).
 */
export function slideScriptureFacts(
  element: SlideScriptureElement,
  background: Slide["background"],
  payload?: ScriptureRenderPayload
): RenderFacts {
  const { ctx, draws } = recordingCtx()
  const slide: Slide = {
    id: "parity-slide",
    name: "parity",
    background,
    elements: [element],
    createdAt: 0,
    updatedAt: 0,
  }
  renderSlide(
    ctx,
    slide,
    RENDER_W,
    RENDER_H,
    undefined,
    undefined,
    payload
      ? { scriptureContent: new Map([[element.id, payload]]) }
      : undefined
  )
  return analyze(draws)
}

/**
 * Compare the two scripture render paths for one theme × verse and report where
 * they diverge. `options` are forwarded to the verse path (e.g. `surface` +
 * `verseAutoFit` to exercise auto-fit divergence).
 */
export function diffScriptureParity(
  theme: BroadcastTheme,
  verse: VerseRenderData,
  options?: RenderOptions
): ScriptureParityReport {
  // The scripture element is style-only (no baked content); the verse rides a
  // render-time payload (decision D2), so the slide path delegates to the verse
  // draw passes rather than flattening. The verse `style` is the theme itself —
  // the parity gate proves the slide path can reproduce `renderVerse` byte-for-
  // byte by driving the identical draw functions.
  const element = scriptureElementFromTheme(theme)

  const verseF = verseFacts(theme, verse, options)
  const slideF = slideScriptureFacts(
    element,
    {
      type: "solid",
      color:
        theme.background.type === "solid" ? theme.background.color : "#000000",
    },
    // The same render options ride the payload (auto-fit thresholds, offsets) so
    // the slide path runs the identical verse layout — surface is derived from the
    // draw canvas inside the renderer, so it is omitted here (Phase 4c).
    { verse, style: theme, options }
  )

  const divergences: string[] = []

  // Each check below is a *gate*: the payload path drives the same verse layout
  // (`computeVerseLayoutMetrics`) and draw passes as `renderVerse`, so a divergence
  // firing means the delegation drifted — a real regression. As of Phase 4c this
  // holds under auto-fit + surface scaling too (check 4), so the set is empty.

  // 1. Verse numbers: the verse renderer emits each verse number as its own
  //    styled token. Compare on an *exact* token match so a number that only
  //    appears inside the reference (e.g. "3:16") does not mask a real drop.
  for (const seg of verse.segments) {
    if (seg.verseNumber == null || !theme.verseNumbers.visible) continue
    const num = String(seg.verseNumber)
    if (verseF.texts.includes(num) && !slideF.texts.includes(num)) {
      divergences.push(
        `verse-number: verse path emits "${num}" as a token; slide path does not`
      )
      break
    }
  }

  // 2. Reference label format (uppercase, transform, position).
  if (verseF.referenceText !== slideF.referenceText)
    divergences.push(
      `reference-format: verse="${verseF.referenceText}" slide="${slideF.referenceText}"`
    )

  // 3. Body text: same words → agree; same words but different case →
  //    text-transform gap; otherwise a genuine content/wrapping divergence.
  if (verseF.bodyText !== slideF.bodyText) {
    if (verseF.bodyText.toLowerCase() === slideF.bodyText.toLowerCase())
      divergences.push(
        "text-transform: verse and slide paths applied a different textTransform"
      )
    else divergences.push("text-content: verse and scripture body text differ")
  }

  // 4. Body font size (surfaceFontScale / auto-fit differences).
  if (verseF.bodyFontPx !== slideF.bodyFontPx)
    divergences.push(
      `body-font: verse=${verseF.bodyFontPx}px slide=${slideF.bodyFontPx}px`
    )

  return {
    themeId: theme.id,
    reference: verse.reference,
    verse: verseF,
    slide: slideF,
    divergences,
  }
}
