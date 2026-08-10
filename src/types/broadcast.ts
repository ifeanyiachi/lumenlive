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

/**
 * How an output's render surface is sized (see `lib/broadcast-output/surface.ts`):
 * - `native` — render at the output window's real pixel size and reflow content
 *              to that aspect ratio (EasyWorship-style). Default.
 * - `custom` — render at a fixed authored resolution ({@link BroadcastOutput.customResolution}),
 *              mapped onto the monitor per {@link BroadcastOutput.customFit}.
 *
 * NDI overrides both while active — the NDI session resolution wins the surface
 * so the feed is never distorted (see surface.ts precedence + screenim.md §7).
 */
export type OutputDisplayMode = "native" | "custom"

export interface BroadcastOutput {
  id: string
  name: string
  themeId: string
  mode: "normal" | "stage"
  contentSource: ContentRouting
  /** Surface sizing. Optional for back-compat; a missing value is `"native"`. */
  displayMode?: OutputDisplayMode
  /** Authored surface size when {@link displayMode} is `"custom"`. */
  customResolution?: { width: number; height: number }
  /** How a `custom` surface maps onto a mismatched monitor. Missing = `"contain"`. */
  customFit?: "contain" | "cover"
  /**
   * Vertical auto-fit for verse text (grow/shrink to fill the text box, like
   * EasyWorship). Missing = `true`. When `false`, the authored px font size is
   * kept and only wrapping reflows.
   */
  verseAutoFit?: boolean
  /** Max verse-font growth vs the authored size when auto-fitting. Missing = 1.5. */
  maxVerseScale?: number
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

/**
 * A named set of stage monitors, so the operator can push a private stage cue
 * (message/announcement) to several presenter screens at once — e.g. "Musicians"
 * or "Hosts". Membership is by output id; stale ids are pruned when an output is
 * removed. Purely a targeting convenience — the cue content itself is stored
 * per-output, not per-group.
 */
export interface StageMonitorGroup {
  id: string
  name: string
  outputIds: string[]
}

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
  /**
   * Render at this real output size and reflow to its aspect ratio, instead of
   * the theme's authored resolution. When set, the theme is projected onto the
   * surface (fonts/padding scaled by the shorter axis, box reflowed from the
   * surface). Omit for the design/preview path (unchanged authored layout).
   */
  surface?: { width: number; height: number }
  /**
   * Grow/shrink the verse font to fill the text box height. Opt-in (default
   * off), so only the live output auto-fits — the theme designer keeps showing
   * authored sizes. Requires {@link surface} to be meaningful.
   */
  verseAutoFit?: boolean
  /** Cap on verse-font growth vs the surface-proportional size. Default 1.5. */
  maxVerseScale?: number
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
