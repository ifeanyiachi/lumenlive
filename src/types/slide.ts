// The animated-background model lives in the shared canvas primitives so the
// broadcast/stage `Background` and the slide `SlideBackground` share one spec.
// Imported for local use and re-exported so existing `@/types/slide` imports
// keep resolving unchanged.
import type { AnimatedBackground, AnimatedBackgroundPreset } from "./canvas"
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

// ── Slide Themes ──

export type SlideThemeCategory = "general" | "song" | "scripture"
export type SlideLayoutVariant =
  "title" | "title-content" | "content-only" | "blank" | "scripture"

export type SlideThemeElement =
  | Omit<SlideTextElement, "id">
  | Omit<SlideImageElement, "id">
  | Omit<SlideScriptureElement, "id">
  | Omit<SlideShapeElement, "id">
  | Omit<SlideVideoElement, "id">

export interface SlideThemeVariant {
  layout: SlideLayoutVariant
  background: SlideBackground
  elements: SlideThemeElement[]
}

export interface SlideTheme {
  id: string
  name: string
  category: SlideThemeCategory
  builtin: boolean
  variants: SlideThemeVariant[]
}
