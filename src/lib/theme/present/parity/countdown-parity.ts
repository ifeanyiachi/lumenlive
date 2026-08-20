import type { BroadcastTheme } from "@/types/broadcast"
import type { CountdownFormat } from "@/types/alert"
import type {
  Slide,
  SlideTextElement,
  SlideTimerElement,
} from "@/types/slide"
import { renderCountdownTheme } from "@/lib/countdown/theme-render"
import {
  formatCountdownTime,
  resolveTimeColor,
} from "@/lib/countdown/timer"
import { renderSlide } from "@/lib/slide-renderer"
import { fontPx, recordingCtx, type TextDraw } from "./recording-ctx"

/**
 * Countdown parity harness (themeredo.md, Phase 4d).
 *
 * The countdown overlay's *look* moves from the verse path to the new model: a
 * Countdown `Theme` whose ticking time is a {@link SlideTimerElement} placeholder,
 * decorated with a heading text element for the label. Unlike scripture (Phase 4b/
 * 4c), the geometry legitimately changes — the verse path centres auto-fit digits
 * in the verse region, the timer element draws a single line inside its own box —
 * so a *byte-identical* pixel gate is the wrong instrument here.
 *
 * What MUST stay identical is the correctness-critical content: the **digit
 * string**, the **urgency colour**, and the **label**. Both paths already derive
 * these from the one shared `lib/countdown` math, so this harness drives the
 * reference path (`renderCountdownTheme` → `renderVerse`) against the candidate
 * path (`renderSlide` over a timer-element slide) and proves the two never
 * disagree on *what time to show, in what colour, under what label*. A divergence
 * firing means the timer-element representation drifted from the countdown overlay
 * — a real regression the eventual live repoint must not introduce.
 *
 * This is a harness fixture, not the production content path: the live countdown
 * still runs on `BroadcastTheme` until the Phase 5 data migration makes a new
 * Countdown `Theme` reachable from `resolveTimerTheme`. The gate is the
 * precondition that repoint is measured against.
 */

const RENDER_W = 1920
const RENDER_H = 1080

/** The parity-relevant facts a countdown render produced. */
export interface CountdownFacts {
  /** Every drawn string, in order. */
  texts: string[]
  /** The digits: the string drawn at the largest font size. */
  timeText: string | null
  /** The fill colour the digits were drawn in (urgency-resolved). */
  timeColor: string | null
  /** The label drawn at a smaller font than the digits, if any. */
  labelText: string | null
}

export interface CountdownParityReport {
  themeId: string
  verse: CountdownFacts
  slide: CountdownFacts
  /** Human-readable list of the concrete divergences found. */
  divergences: string[]
}

/**
 * One point of a countdown, distilled from an `ActiveCountdown` at a `now`: the
 * seconds left plus the timer's display config. Both render paths are driven from
 * the *same* point so the gate proves they agree, not merely that each is
 * internally consistent.
 */
export interface CountdownPoint {
  remaining: number
  format: CountdownFormat
  overtime: boolean
  label: string
  showLabel: boolean
  warnSeconds?: number
  dangerSeconds?: number
}

function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

function analyze(draws: TextDraw[]): CountdownFacts {
  const texts = draws.map((d) => d.text)
  const sizes = draws
    .map((d) => fontPx(d.font))
    .filter((n): n is number => n != null)
  const bodyFontPx = sizes.length ? Math.max(...sizes) : null
  // The digits are drawn at the largest font on both paths (the verse body / the
  // timer element's big time text). Take the first such draw.
  const timeDraw = draws.find((d) => fontPx(d.font) === bodyFontPx)
  // The label is a smaller-font draw (the reference slot / the heading element).
  // A hidden label still emits an empty token on the verse path (the reference
  // slot collapsed to zero height); the slide path simply omits the element —
  // both mean "no label", so normalise an empty draw to null.
  const labelDraw = draws.find((d) => (fontPx(d.font) ?? 0) < (bodyFontPx ?? 0))
  const labelText = labelDraw ? collapse(labelDraw.text) : ""
  return {
    texts,
    timeText: timeDraw ? collapse(timeDraw.text) : null,
    timeColor: timeDraw ? timeDraw.fillStyle : null,
    labelText: labelText === "" ? null : labelText,
  }
}

/** Format the digits + resolve the urgency colour for `point` off `baseColor`. */
function displayFor(
  point: CountdownPoint,
  baseColor: string
): { timeText: string; timeColor: string } {
  return {
    timeText: formatCountdownTime(point.remaining, point.format, point.overtime),
    timeColor: resolveTimeColor(point.remaining, {
      textColor: baseColor,
      warnSeconds: point.warnSeconds,
      dangerSeconds: point.dangerSeconds,
    }),
  }
}

/** Run the reference path (`renderCountdownTheme`) and collect its facts. */
export function countdownVerseFacts(
  theme: BroadcastTheme,
  point: CountdownPoint
): CountdownFacts {
  const { ctx, draws } = recordingCtx()
  const { timeText, timeColor } = displayFor(point, theme.verseText.color)
  renderCountdownTheme(ctx, theme, {
    timeText,
    label: point.label,
    showLabel: point.showLabel,
    timeColor,
    surface: { width: RENDER_W, height: RENDER_H },
  })
  return analyze(draws)
}

/**
 * Build the candidate slide: a {@link SlideTimerElement} for the digits (styled
 * from the theme's verse typography, carrying the same urgency thresholds so it
 * resolves the identical colour) plus, when the label shows, a heading text
 * element. `durationSeconds` is pinned to `point.remaining` so the element's own
 * `computeTimerDisplay` yields the same string + colour as the reference frame.
 */
export function countdownSlideFromTheme(
  theme: BroadcastTheme,
  point: CountdownPoint
): Slide {
  const vt = theme.verseText
  const timer: SlideTimerElement = {
    id: "parity-timer",
    type: "timer",
    x: 5,
    y: 20,
    width: 90,
    height: 60,
    mode: "duration",
    durationSeconds: point.remaining,
    format: point.format,
    overtime: point.overtime,
    fontFamily: vt.fontFamily,
    fontSize: vt.fontSize,
    fontWeight: vt.fontWeight,
    italic: false,
    color: vt.color,
    horizontalAlign: "center",
    verticalAlign: "middle",
    warnSeconds: point.warnSeconds,
    dangerSeconds: point.dangerSeconds,
  }
  const elements: Slide["elements"] = [timer]
  if (point.showLabel && point.label) {
    // Mirror the theme's reference casing so the heading reproduces the countdown
    // overlay's label exactly (the verse path applies `uppercase` then transform).
    const ref = theme.reference
    const refTransform: SlideTextElement["textTransform"] =
      ref.uppercase || ref.textTransform === "uppercase"
        ? "uppercase"
        : ref.textTransform === "lowercase"
          ? "lowercase"
          : "none"
    const label: SlideTextElement = {
      id: "parity-label",
      type: "text",
      text: point.label,
      x: 5,
      y: 8,
      width: 90,
      height: 10,
      fontFamily: theme.reference.fontFamily,
      fontSize: theme.reference.fontSize,
      fontWeight: theme.reference.fontWeight,
      bold: false,
      italic: false,
      underline: false,
      color: theme.reference.color,
      letterSpacing: 0,
      horizontalAlign: "center",
      verticalAlign: "middle",
      lineHeight: 1.2,
      textTransform: refTransform,
    }
    elements.push(label)
  }
  return {
    id: "parity-countdown-slide",
    name: "parity",
    background: {
      type: "solid",
      color:
        theme.background.type === "solid" ? theme.background.color : "#000000",
    },
    elements,
    createdAt: 0,
    updatedAt: 0,
  }
}

/** Run the candidate path (`renderSlide` over the timer slide) and collect facts. */
export function countdownSlideFacts(
  theme: BroadcastTheme,
  point: CountdownPoint
): CountdownFacts {
  const { ctx, draws } = recordingCtx()
  renderSlide(ctx, countdownSlideFromTheme(theme, point), RENDER_W, RENDER_H)
  return analyze(draws)
}

/**
 * Compare the two countdown render paths for one theme × point and report where
 * they diverge on the correctness-critical content (digits, colour, label). As of
 * Phase 4d the divergence set is empty — both derive from the shared countdown
 * math — so a divergence firing is a real regression.
 */
export function diffCountdownParity(
  theme: BroadcastTheme,
  point: CountdownPoint
): CountdownParityReport {
  const verse = countdownVerseFacts(theme, point)
  const slide = countdownSlideFacts(theme, point)
  const divergences: string[] = []

  // 1. The digit string: both paths format the same remaining seconds the same
  //    way, so the drawn time token must match exactly.
  if (verse.timeText !== slide.timeText)
    divergences.push(
      `time-text: verse="${verse.timeText}" slide="${slide.timeText}"`
    )

  // 2. The urgency colour: both resolve it off the theme's base colour + the same
  //    warn/danger thresholds, so the digits must be drawn in the same fill.
  if (verse.timeColor !== slide.timeColor)
    divergences.push(
      `time-color: verse="${verse.timeColor}" slide="${slide.timeColor}"`
    )

  // 3. The label: shown/hidden and its text must agree.
  if (verse.labelText !== slide.labelText)
    divergences.push(
      `label: verse="${verse.labelText}" slide="${slide.labelText}"`
    )

  return { themeId: theme.id, verse, slide, divergences }
}
