// The animated-background model lives in the shared canvas primitives so the
// broadcast/stage `Background` and the slide `SlideBackground` share one spec.
// Imported for local use and re-exported so existing `@/types/slide` imports
// keep resolving unchanged.
import type { AnimatedBackground, AnimatedBackgroundPreset } from "./canvas"
import type { CountdownFormat, CountdownMode } from "./alert"
export type { AnimatedBackground, AnimatedBackgroundPreset }

// ── Element Animation ──

export type ElementAnimationType =
  | "none"
  | "fade"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "scale"

export interface ElementAnimation {
  type: ElementAnimationType
  duration: number
  delay: number
  easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
}

/**
 * Placeholder role for a text element inside a {@link import("./theme").Theme}
 * (themeredo.md — the type-first theme model). Marks *what* live/authored
 * content flows into this element when the theme is presented:
 *
 * - `"lyrics"` — the current lyric lines of a song theme
 * - `"title"` — the sermon / announcement heading (authored at build time)
 * - `"points"` — the sermon points block (authored at build time)
 * - `"body"` — the announcement body (authored at build time)
 *
 * Undefined for ordinary decorative text (the common case). Scripture and timer
 * placeholders stay dedicated element types because they render differently, not
 * just as styled text — only text placeholders carry a `role`.
 */
export type TextPlaceholderRole = "lyrics" | "title" | "points" | "body"

export type TextBuildType = "none" | "line-by-line" | "word-by-word"

/**
 * How each revealed item appears. `"cut"` (default when omitted) is the original
 * hard character-slice typewriter. `"fade-up"` and `"blur-in"` render the whole
 * line but ramp its opacity (and rise / defocus) over the item's progress — a
 * softer, worship-friendly reveal.
 */
export type TextBuildReveal = "cut" | "fade-up" | "blur-in"

export interface TextBuildAnimation {
  type: TextBuildType
  duration: number
  delay: number
  reveal?: TextBuildReveal
}

export interface ScrollingConfig {
  speed: number
  direction: "up" | "down"
}

// ── Base element shared by all slide element types ──

interface SlideElementBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  locked?: boolean
  visible?: boolean
  animation?: {
    entry?: ElementAnimation
    exit?: ElementAnimation
  }
}

// ── Text element ──

export interface SlideTextElement extends SlideElementBase {
  type: "text"
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  bold: boolean
  italic: boolean
  underline: boolean
  color: string
  letterSpacing?: number
  horizontalAlign: "left" | "center" | "right"
  verticalAlign: "top" | "middle" | "bottom"
  lineHeight: number
  textTransform: "none" | "uppercase" | "lowercase"
  listType?: "none" | "bullet" | "numbered"
  backgroundColor?: string
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string }
  outline?: { width: number; color: string }
  textBuild?: TextBuildAnimation
  scrolling?: ScrollingConfig
  /**
   * Typed-placeholder marker for the Theme model (themeredo.md). Present only on
   * theme placeholder text; content flows into it at go-live. See
   * {@link TextPlaceholderRole}.
   */
  role?: TextPlaceholderRole
}

// ── Image element ──

export interface SlideImageElement extends SlideElementBase {
  type: "image"
  imageUrl: string
  objectFit: "cover" | "contain" | "fill"
  opacity: number
  borderRadius: number
}

// ── Scripture element ──

export interface SlideScriptureElement extends SlideElementBase {
  type: "scripture"
  reference: string
  verseText: string
  translation: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  bold: boolean
  italic: boolean
  color: string
  horizontalAlign: "left" | "center" | "right"
  verticalAlign: "top" | "middle" | "bottom"
  lineHeight: number
  referenceFontSize: number
  referenceColor: string
  backgroundColor?: string
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string }
  outline?: { width: number; color: string }
  // ── Verse-style carriers (themeredo.md, RF1) ──
  // The lean scripture placeholder gains the verse-styling the live path needs so
  // the verse body can render from the element alone (retiring the dependency on the
  // full BroadcastTheme). All optional and backward-compatible: an element without
  // them renders exactly as before. Consumed by `scriptureElementToVerseStyle` when
  // building the live scripture render payload; populated by the broadcast → Theme
  // migrator so no authored verse styling is lost.
  /** Per-verse number styling (superscript verse markers). */
  verseNumbers?: {
    visible: boolean
    fontSize: number
    color: string
    superscript: boolean
  }
  /** Uppercase the reference label. */
  referenceUppercase?: boolean
  /** Where the reference sits relative to the verse body. */
  referencePosition?: "above" | "below" | "inline"
  /** Start each verse on its own line when several are shown together. */
  breakPerVerse?: boolean
  /** Case transform applied to the verse body. */
  textTransform?: "none" | "uppercase" | "lowercase"
  /** Extra tracking (px) on the verse body. */
  letterSpacing?: number
  /** Rounded backdrop box behind the verse text area. */
  textBox?: {
    enabled: boolean
    color: string
    opacity: number
    borderRadius: number
    padding: number
  }
}

// ── Timer element ──

/**
 * A live countdown/clock **placeholder** for the Theme model (themeredo.md — the
 * Countdown type's required element). Unlike an `ActiveCountdown` runtime
 * instance, this is authored *configuration* embedded in a slide/theme: it stores
 * how the time is derived (`mode` + `durationSeconds`/`targetTime`) and how it is
 * styled. The renderer projects it to a formatted time string at draw time,
 * reusing the pure `lib/countdown` math (no duplication) — so preview and live
 * output agree frame-to-frame. In authoring/preview (no injected wall-clock) it
 * renders the static configured duration; at go-live it ticks against `now`.
 */
export interface SlideTimerElement extends SlideElementBase {
  type: "timer"
  /** How remaining time is derived: a fixed length, or a wall-clock time-of-day. */
  mode: CountdownMode
  /** Duration-mode length in seconds; also the static value shown in preview. */
  durationSeconds: number
  /** Clock-mode target time-of-day, "HH:MM" (24h). Ignored in duration mode. */
  targetTime?: string
  format: CountdownFormat
  /**
   * When true, keep counting past zero with a leading "-" (how far over), instead
   * of clamping the display at 00:00.
   */
  overtime?: boolean
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  /** Base time-text color; overridden by the warn/danger thresholds below. */
  color: string
  horizontalAlign: "left" | "center" | "right"
  verticalAlign: "top" | "middle" | "bottom"
  /** Recolor to amber at/under this many seconds remaining (optional). */
  warnSeconds?: number
  /** Recolor to red at/under this many seconds remaining (optional). */
  dangerSeconds?: number
  backgroundColor?: string
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string }
  outline?: { width: number; color: string }
}

// ── Shape element ──

export interface SlideShapeElement extends SlideElementBase {
  type: "shape"
  shapeType: "rectangle" | "circle" | "rounded-rect"
  fillColor: string
  strokeColor: string
  strokeWidth: number
  opacity: number
  borderRadius: number
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string }
  maskTargetId?: string
}

// ── Video element ──

export interface SlideVideoElement extends SlideElementBase {
  type: "video"
  videoUrl: string
  objectFit: "cover" | "contain" | "fill"
  opacity: number
  borderRadius: number
  muted: boolean
  loop: boolean
}

// ── Discriminated union ──

export type SlideElement =
  | SlideTextElement
  | SlideImageElement
  | SlideScriptureElement
  | SlideShapeElement
  | SlideVideoElement
  | SlideTimerElement

// ── Background ──

export interface SlideBackground {
  type: "solid" | "gradient" | "image" | "video" | "transparent" | "animated"
  color?: string
  gradient?: {
    type: "linear" | "radial"
    angle?: number
    stops: { offset: number; color: string }[]
  }
  animated?: AnimatedBackground
  mediaAssetId?: string
  imageUrl?: string
  videoUrl?: string
  blur?: number
  brightness?: number
  tint?: string
}

// ── Slide Transition ──

export type SlideTransitionType =
  | "cut"
  | "fade"
  | "dissolve"
  | "push-left"
  | "push-right"
  | "wipe-left"
  | "wipe-right"

export interface SlideTransition {
  type: SlideTransitionType
  duration: number
}

// ── Slide & Presentation ──

export interface Slide {
  id: string
  name: string
  background: SlideBackground
  elements: SlideElement[]
  transition?: SlideTransition
  createdAt: number
  updatedAt: number
}

export interface Presentation {
  id: string
  name: string
  slides: Slide[]
  createdAt: number
  updatedAt: number
}
