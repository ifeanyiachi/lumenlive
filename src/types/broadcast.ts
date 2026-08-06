import type { StyledSpan } from "./verse-edit"
import type { NdiResolution, NdiFrameRate, NdiAlphaMode } from "./ndi"
import type { CanvasBox, Background, TextStyle } from "./canvas"

// Re-export the shared canvas primitives so existing `@/types/broadcast`
// imports keep resolving after the extraction (see types/canvas.ts).
export type {
  CanvasBox,
  Background,
  TextStyle,
  Shadow,
  Outline,
  TextHorizontalAlign,
  TextVerticalAlign,
  TextTransform,
  TextDecoration,
} from "./canvas"

// ── Multi-Output Routing ──

export interface BroadcastOutput {
  id: string
  name: string
  themeId: string
  mode: "normal" | "stage"
  contentSource: ContentRouting
  ndi?: {
    sourceName: string
    resolution: NdiResolution
    frameRate: NdiFrameRate
    alphaMode: NdiAlphaMode
  }
  monitor?: number
  /**
   * Legacy fixed stage-display settings. Retained for back-compat; superseded by
   * `stageLayoutId` when a named Stage Layout preset is assigned.
   */
  stageConfig?: StageDisplayConfig
  /** Selected Stage Layout preset for a `mode: "stage"` output. */
  stageLayoutId?: string
  enabled: boolean
}

export type ContentRouting =
  | { type: "mirror"; sourceOutputId: string }
  | { type: "independent" }
  | { type: "layer-filter"; layers: LayerFilter }

export interface LayerFilter {
  showContent: boolean
  showProps: boolean
  showAlerts: boolean
  showCountdowns: boolean
  showMediaLayer: boolean
}

export interface VerseSegment {
  verseNumber?: number
  text: string
  isInterlinear?: boolean
  spans?: StyledSpan[]
}

export interface VerseRenderData {
  reference: string
  segments: VerseSegment[]
}

export interface RenderOptions {
  opacity?: number
  offsetX?: number
  offsetY?: number
  scale?: number // Scale factor for rendering at display size (e.g., 0.42 for 400px panel)
  imageCache?: Map<string, HTMLImageElement>
}

export interface StageDisplayConfig {
  layout: "standard" | "minimal"
  showCurrent: boolean
  showClock: boolean
  showNotes: boolean
  backgroundColor: string
  textColor: string
  fontFamily: string
  fontSize: number
  clockFormat: "12h" | "24h"
}

export const DEFAULT_STAGE_DISPLAY_CONFIG: StageDisplayConfig = {
  layout: "standard",
  showCurrent: true,
  showClock: true,
  showNotes: true,
  backgroundColor: "#1a1a2e",
  textColor: "#e0e0e0",
  fontFamily: "Inter",
  fontSize: 32,
  clockFormat: "12h",
}

export type ThemeCategory =
  "general" | "song" | "scripture" | "sermon" | "overlay" | "countdown"

export interface ThemeElement extends CanvasBox {
  type: "image" | "shape"
  image?: {
    url: string
    fit: "cover" | "contain" | "stretch"
    opacity: number
    borderRadius: number
  }
  shape?: {
    shapeType: "rectangle" | "rounded-rect" | "circle"
    fillColor: string
    fillOpacity: number
    strokeColor: string
    strokeWidth: number
    borderRadius: number
  }
  maskTargetId?: string
}

export interface BroadcastTheme {
  id: string
  name: string
  category?: ThemeCategory
  builtin: boolean
  pinned: boolean
  createdAt: number
  updatedAt: number
  resolution: { width: number; height: number }
  elements: ThemeElement[]
  layerOrder: string[]
  background: Background
  textBox: {
    enabled: boolean
    color: string
    opacity: number
    borderRadius: number
    padding: number
  }
  verseText: TextStyle
  verseNumbers: {
    visible: boolean
    fontSize: number
    color: string
    superscript: boolean
  }
  reference: TextStyle & {
    uppercase: boolean
    position: "above" | "below" | "inline"
  }
  layout: {
    anchor:
      | "center"
      | "top-left"
      | "top-center"
      | "top-right"
      | "bottom-left"
      | "bottom-center"
      | "bottom-right"
    offsetX: number
    offsetY: number
    padding: { top: number; right: number; bottom: number; left: number }
    textAlign: "left" | "center" | "right"
    backgroundWidth: number
    backgroundHeight: number
    textAreaWidth: number
    textAreaHeight: number
    referenceGap?: number
  }
  transition: {
    type: "fade" | "slide" | "scale" | "none"
    duration: number
    easing: "linear" | "ease-in" | "ease-out" | "ease-in-out"
    direction: "up" | "down" | "left" | "right"
  }
}
