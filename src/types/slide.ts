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

export function createDefaultTextElement(): SlideTextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    text: "New text",
    x: 10,
    y: 30,
    width: 80,
    height: 40,
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: 600,
    bold: false,
    italic: false,
    underline: false,
    color: "#ffffff",
    letterSpacing: 0,
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.4,
    textTransform: "none",
  }
}

export const createDefaultElement = createDefaultTextElement

export function createDefaultImageElement(): SlideImageElement {
  return {
    id: crypto.randomUUID(),
    type: "image",
    imageUrl: "",
    x: 20,
    y: 20,
    width: 60,
    height: 60,
    objectFit: "contain",
    opacity: 1,
    borderRadius: 0,
  }
}

export function createDefaultScriptureElement(): SlideScriptureElement {
  return {
    id: crypto.randomUUID(),
    type: "scripture",
    reference: "",
    verseText: "",
    translation: "",
    x: 10,
    y: 20,
    width: 80,
    height: 60,
    fontFamily: "Inter",
    fontSize: 40,
    fontWeight: 400,
    bold: false,
    italic: false,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.5,
    referenceFontSize: 24,
    referenceColor: "#cccccc",
  }
}

export function createDefaultVideoElement(): SlideVideoElement {
  return {
    id: crypto.randomUUID(),
    type: "video",
    videoUrl: "",
    x: 20,
    y: 20,
    width: 60,
    height: 40,
    objectFit: "cover",
    opacity: 1,
    borderRadius: 0,
    muted: true,
    loop: true,
  }
}

export function createDefaultShapeElement(): SlideShapeElement {
  return {
    id: crypto.randomUUID(),
    type: "shape",
    shapeType: "rounded-rect",
    x: 20,
    y: 20,
    width: 60,
    height: 40,
    fillColor: "rgba(255,255,255,0.15)",
    strokeColor: "#ffffff",
    strokeWidth: 2,
    opacity: 1,
    borderRadius: 12,
  }
}

export function createDefaultSlide(): Slide {
  return {
    id: crypto.randomUUID(),
    name: "Untitled Slide",
    background: { type: "solid", color: "#1a1a2e" },
    elements: [createDefaultTextElement()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

export interface Presentation {
  id: string
  name: string
  slides: Slide[]
  createdAt: number
  updatedAt: number
}

export function createDefaultPresentation(
  name = "Untitled Presentation"
): Presentation {
  return {
    id: crypto.randomUUID(),
    name,
    slides: [createDefaultSlide()],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
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

/**
 * Factory for the built-in animated song themes. Each is a `content-only` +
 * `blank` variant pair sharing one {@link AnimatedBackground} spec, so
 * `generateSlidesFromSong` bakes the animated background onto every slide. The
 * lyric text carries a soft glow tuned to the palette.
 */
function makeAnimatedSongTheme(t: {
  id: string
  name: string
  animated: AnimatedBackground
  textColor: string
  glow: string
  fontFamily?: string
}): SlideTheme {
  const lyric: SlideThemeElement = {
    type: "text",
    text: "Verse lyrics here",
    x: 5,
    y: 15,
    width: 90,
    height: 70,
    fontFamily: t.fontFamily ?? "Inter",
    fontSize: 52,
    fontWeight: 600,
    bold: false,
    italic: false,
    underline: false,
    color: t.textColor,
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.4,
    textTransform: "none",
    shadow: { offsetX: 0, offsetY: 0, blur: 24, color: t.glow },
    textBuild: {
      type: "line-by-line",
      duration: 320,
      delay: 0,
      reveal: "fade-up",
    },
  }
  return {
    id: t.id,
    name: t.name,
    category: "song",
    builtin: true,
    variants: [
      {
        layout: "content-only",
        background: { type: "animated", animated: t.animated },
        elements: [lyric],
      },
      {
        layout: "blank",
        background: { type: "animated", animated: t.animated },
        elements: [],
      },
    ],
  }
}

export const ANIMATED_SONG_THEMES: SlideTheme[] = [
  makeAnimatedSongTheme({
    id: "theme-aurora-worship",
    name: "Aurora Worship",
    animated: {
      preset: "aurora",
      palette: ["#4c1d95", "#1e3a8a", "#0ea5e9"],
      speed: 1,
      intensity: 0.6,
      baseColor: "#0b1020",
    },
    textColor: "#f0f9ff",
    glow: "rgba(14,165,233,0.45)",
  }),
  makeAnimatedSongTheme({
    id: "theme-golden-bokeh",
    name: "Golden Bokeh",
    animated: {
      preset: "bokeh",
      palette: ["#f59e0b", "#fbbf24", "#fde68a"],
      speed: 0.8,
      intensity: 0.7,
      baseColor: "#1a1206",
    },
    textColor: "#fffbeb",
    glow: "rgba(251,191,36,0.4)",
  }),
  makeAnimatedSongTheme({
    id: "theme-ember-glow",
    name: "Ember Glow",
    animated: {
      preset: "embers",
      palette: ["#f97316", "#ef4444", "#fbbf24"],
      speed: 1,
      intensity: 0.7,
      baseColor: "#1a0a05",
    },
    textColor: "#fff7ed",
    glow: "rgba(249,115,22,0.45)",
  }),
  makeAnimatedSongTheme({
    id: "theme-starry-host",
    name: "Starry Host",
    animated: {
      preset: "starfield",
      palette: ["#e0e7ff", "#a5b4fc", "#c7d2fe"],
      speed: 1,
      intensity: 0.8,
      baseColor: "#060814",
    },
    textColor: "#eef2ff",
    glow: "rgba(165,180,252,0.4)",
  }),
  makeAnimatedSongTheme({
    id: "theme-silent-night",
    name: "Silent Night",
    animated: {
      preset: "snow",
      palette: ["#e0f2fe", "#bae6fd", "#f0f9ff"],
      speed: 0.9,
      intensity: 0.7,
      baseColor: "#0b1a2b",
    },
    textColor: "#f8fafc",
    glow: "rgba(186,230,253,0.4)",
  }),
  makeAnimatedSongTheme({
    id: "theme-light-of-the-world",
    name: "Light of the World",
    animated: {
      preset: "godrays",
      palette: ["#fde68a", "#fca5a5", "#fef3c7"],
      speed: 0.8,
      intensity: 0.7,
      baseColor: "#12100a",
    },
    textColor: "#fffdf5",
    glow: "rgba(253,230,138,0.45)",
  }),
  makeAnimatedSongTheme({
    id: "theme-flowing-grace",
    name: "Flowing Grace",
    animated: {
      preset: "gradient-drift",
      palette: ["#0f766e", "#1e3a8a", "#6d28d9"],
      speed: 0.7,
      intensity: 0.9,
      baseColor: "#050b12",
    },
    textColor: "#f0fdfa",
    glow: "rgba(45,212,191,0.4)",
  }),
]

export const BUILTIN_SLIDE_THEMES: SlideTheme[] = [
  {
    id: "theme-midnight",
    name: "Midnight",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#0f0c29" },
              { offset: 0.5, color: "#302b63" },
              { offset: 1, color: "#24243e" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Inter",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#ffffff",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Inter",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#a5b4fc",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "title-content",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#0f0c29" },
              { offset: 0.5, color: "#302b63" },
              { offset: 1, color: "#24243e" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 5,
            y: 5,
            width: 90,
            height: 15,
            fontFamily: "Inter",
            fontSize: 48,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#ffffff",
            horizontalAlign: "left",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Content goes here",
            x: 5,
            y: 25,
            width: 90,
            height: 65,
            fontFamily: "Inter",
            fontSize: 32,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#e2e8f0",
            horizontalAlign: "left",
            verticalAlign: "top",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#0f0c29" },
              { offset: 0.5, color: "#302b63" },
              { offset: 1, color: "#24243e" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Content goes here",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Inter",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#ffffff",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#0f0c29" },
              { offset: 0.5, color: "#302b63" },
              { offset: 1, color: "#24243e" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-warm-glow",
    name: "Warm Glow",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#92400e" },
              { offset: 1, color: "#451a03" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Georgia",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#fef3c7",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Georgia",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: true,
            underline: false,
            color: "#fbbf24",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#92400e" },
              { offset: 1, color: "#451a03" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Content",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Georgia",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#fef3c7",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#92400e" },
              { offset: 1, color: "#451a03" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-ocean",
    name: "Ocean Deep",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 180,
            stops: [
              { offset: 0, color: "#0c4a6e" },
              { offset: 1, color: "#082f49" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Inter",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#e0f2fe",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Inter",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#7dd3fc",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 180,
            stops: [
              { offset: 0, color: "#0c4a6e" },
              { offset: 1, color: "#082f49" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Content",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Inter",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#e0f2fe",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 180,
            stops: [
              { offset: 0, color: "#0c4a6e" },
              { offset: 1, color: "#082f49" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-forest",
    name: "Forest",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 160,
            stops: [
              { offset: 0, color: "#14532d" },
              { offset: 1, color: "#052e16" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Georgia",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#dcfce7",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Georgia",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#86efac",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 160,
            stops: [
              { offset: 0, color: "#14532d" },
              { offset: 1, color: "#052e16" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Content",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Georgia",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#dcfce7",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 160,
            stops: [
              { offset: 0, color: "#14532d" },
              { offset: 1, color: "#052e16" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-clean-white",
    name: "Clean White",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: { type: "solid", color: "#ffffff" },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Inter",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#1e293b",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Inter",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#64748b",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: { type: "solid", color: "#ffffff" },
        elements: [
          {
            type: "text",
            text: "Content",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Inter",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#1e293b",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: { type: "solid", color: "#ffffff" },
        elements: [],
      },
    ],
  },
  {
    id: "theme-worship-lyrics",
    name: "Worship Lyrics",
    category: "song",
    builtin: true,
    variants: [
      {
        layout: "content-only",
        background: { type: "solid", color: "#000000" },
        elements: [
          {
            type: "text",
            text: "Verse lyrics here",
            x: 5,
            y: 15,
            width: 90,
            height: 70,
            fontFamily: "Inter",
            fontSize: 52,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#ffffff",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: { type: "solid", color: "#000000" },
        elements: [],
      },
    ],
  },
  {
    id: "theme-lyric-glow",
    name: "Lyric Glow",
    category: "song",
    builtin: true,
    variants: [
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#1e1b4b" },
              { offset: 1, color: "#0f172a" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Verse lyrics here",
            x: 5,
            y: 15,
            width: 90,
            height: 70,
            fontFamily: "Inter",
            fontSize: 52,
            fontWeight: 600,
            bold: false,
            italic: false,
            underline: false,
            color: "#e0e7ff",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
            shadow: {
              offsetX: 0,
              offsetY: 0,
              blur: 20,
              color: "rgba(99,102,241,0.5)",
            },
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#1e1b4b" },
              { offset: 1, color: "#0f172a" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-hymnal",
    name: "Hymnal",
    category: "song",
    builtin: true,
    variants: [
      {
        layout: "content-only",
        background: { type: "solid", color: "#1c1917" },
        elements: [
          {
            type: "text",
            text: "Verse lyrics here",
            x: 10,
            y: 10,
            width: 80,
            height: 70,
            fontFamily: "Georgia",
            fontSize: 48,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#fef3c7",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
          {
            type: "text",
            text: "— Hymn Title",
            x: 20,
            y: 82,
            width: 60,
            height: 10,
            fontFamily: "Georgia",
            fontSize: 24,
            fontWeight: 400,
            bold: false,
            italic: true,
            underline: false,
            color: "#a8a29e",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: { type: "solid", color: "#1c1917" },
        elements: [],
      },
    ],
  },
  {
    id: "theme-scripture-classic",
    name: "Scripture Classic",
    category: "scripture",
    builtin: true,
    variants: [
      {
        layout: "scripture",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 180,
            stops: [
              { offset: 0, color: "#1e293b" },
              { offset: 1, color: "#0f172a" },
            ],
          },
        },
        elements: [
          {
            type: "scripture",
            reference: "John 3:16",
            verseText: "For God so loved the world...",
            translation: "KJV",
            x: 10,
            y: 15,
            width: 80,
            height: 65,
            fontFamily: "Georgia",
            fontSize: 42,
            fontWeight: 400,
            bold: false,
            italic: false,
            color: "#f1f5f9",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.6,
            referenceFontSize: 24,
            referenceColor: "#94a3b8",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 180,
            stops: [
              { offset: 0, color: "#1e293b" },
              { offset: 1, color: "#0f172a" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-scripture-warm",
    name: "Scripture Warm",
    category: "scripture",
    builtin: true,
    variants: [
      {
        layout: "scripture",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#78350f" },
              { offset: 1, color: "#431407" },
            ],
          },
        },
        elements: [
          {
            type: "scripture",
            reference: "Psalm 23:1",
            verseText: "The LORD is my shepherd...",
            translation: "KJV",
            x: 10,
            y: 15,
            width: 80,
            height: 65,
            fontFamily: "Georgia",
            fontSize: 42,
            fontWeight: 400,
            bold: false,
            italic: false,
            color: "#fef3c7",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.6,
            referenceFontSize: 24,
            referenceColor: "#fbbf24",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#78350f" },
              { offset: 1, color: "#431407" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-ember",
    name: "Ember",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#7f1d1d" },
              { offset: 0.5, color: "#991b1b" },
              { offset: 1, color: "#450a0a" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Inter",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#fecaca",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Inter",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#f87171",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#7f1d1d" },
              { offset: 0.5, color: "#991b1b" },
              { offset: 1, color: "#450a0a" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Content",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Inter",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#fecaca",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 135,
            stops: [
              { offset: 0, color: "#7f1d1d" },
              { offset: 0.5, color: "#991b1b" },
              { offset: 1, color: "#450a0a" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  {
    id: "theme-royal-purple",
    name: "Royal Purple",
    category: "general",
    builtin: true,
    variants: [
      {
        layout: "title",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 160,
            stops: [
              { offset: 0, color: "#581c87" },
              { offset: 1, color: "#3b0764" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Title",
            x: 10,
            y: 30,
            width: 80,
            height: 20,
            fontFamily: "Inter",
            fontSize: 64,
            fontWeight: 700,
            bold: true,
            italic: false,
            underline: false,
            color: "#f5d0fe",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.2,
            textTransform: "none",
          },
          {
            type: "text",
            text: "Subtitle",
            x: 20,
            y: 55,
            width: 60,
            height: 12,
            fontFamily: "Inter",
            fontSize: 28,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#d8b4fe",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.4,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 160,
            stops: [
              { offset: 0, color: "#581c87" },
              { offset: 1, color: "#3b0764" },
            ],
          },
        },
        elements: [
          {
            type: "text",
            text: "Content",
            x: 10,
            y: 10,
            width: 80,
            height: 80,
            fontFamily: "Inter",
            fontSize: 36,
            fontWeight: 400,
            bold: false,
            italic: false,
            underline: false,
            color: "#f5d0fe",
            horizontalAlign: "center",
            verticalAlign: "middle",
            lineHeight: 1.5,
            textTransform: "none",
          },
        ],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "linear",
            angle: 160,
            stops: [
              { offset: 0, color: "#581c87" },
              { offset: 1, color: "#3b0764" },
            ],
          },
        },
        elements: [],
      },
    ],
  },
  ...ANIMATED_SONG_THEMES,
]

/**
 * Migrate legacy elements that lack the `type` discriminator.
 * Called once during hydration so the rest of the app can rely on typed elements.
 */
export function migrateSlideElements(
  presentations: Presentation[]
): Presentation[] {
  let changed = false
  const migrated = presentations.map((p) => ({
    ...p,
    slides: p.slides.map((s) => ({
      ...s,
      elements: s.elements.map((el): SlideElement => {
        if ("type" in el && el.type) return el
        changed = true
        const legacy = el as Record<string, unknown>
        return {
          type: "text",
          id: legacy.id as string,
          text: (legacy.text as string) ?? "",
          x: (legacy.x as number) ?? 0,
          y: (legacy.y as number) ?? 0,
          width: (legacy.width as number) ?? 80,
          height: (legacy.height as number) ?? 40,
          fontFamily: (legacy.fontFamily as string) ?? "Inter",
          fontSize: (legacy.fontSize as number) ?? 48,
          fontWeight: (legacy.fontWeight as number) ?? 600,
          bold: false,
          italic: false,
          underline: false,
          color: (legacy.color as string) ?? "#ffffff",
          horizontalAlign:
            (legacy.horizontalAlign as SlideTextElement["horizontalAlign"]) ??
            "center",
          verticalAlign:
            (legacy.verticalAlign as SlideTextElement["verticalAlign"]) ??
            "middle",
          lineHeight: (legacy.lineHeight as number) ?? 1.4,
          textTransform:
            (legacy.textTransform as SlideTextElement["textTransform"]) ??
            "none",
          backgroundColor: legacy.backgroundColor as string | undefined,
          shadow: legacy.shadow as SlideTextElement["shadow"],
          outline: legacy.outline as SlideTextElement["outline"],
        }
      }),
    })),
  }))
  return changed ? migrated : presentations
}
