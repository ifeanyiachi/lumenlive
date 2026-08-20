import type { StyledSpan } from "./verse-edit"
import type { NdiResolution, NdiFrameRate, NdiAlphaMode } from "./ndi"
import type { CanvasBox, Background, TextStyle } from "./canvas"
import type {
  MediaEndAction,
  MediaMarker,
  MediaFit,
  ContainBackground,
} from "./schedule"

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
 *              to that aspect ratio. Default.
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
   * Vertical auto-fit for verse text (grow/shrink to fill the text box).
   * Missing = `true`. When `false`, the authored px font size is kept and only
   * wrapping reflows.
   */
  verseAutoFit?: boolean
  /** Max verse-font growth vs the authored size when auto-fitting. Missing = 1.5. */
  maxVerseScale?: number
  /**
   * Readable floor for verse auto-fit, in design-space px (scaled by the surface).
   * Auto-fit never shrinks below this. On the main output it also triggers
   * pagination: a passage that won't fit at this size is split into pages. Missing
   * = 40.
   */
  minVerseFontSize?: number
  /** Split a long multi-verse block into operator-steppable pages. Missing = true. */
  paginateLongVerses?: boolean
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
 * Payload for the `broadcast:web-content` event. Tells an output window to mount,
 * replace, or (when the payload is `null`) tear down its embedded YouTube player.
 *
 * YouTube plays *inside* the output window now — the player is a DOM layer over
 * the canvas rather than a separate always-on-top overlay window. Fields mirror
 * the IFrame Player API cue we build in the store's `syncWebOutput`.
 */
export interface WebContentPayload {
  videoId: string
  /** Start offset in seconds (join-late / skip pre-service); 0 = from the top. */
  start: number
  /** VOD out-point in seconds; 0 = play to the natural end. */
  end: number
  isLive: boolean
  muted: boolean
  autoplay: boolean
  /** Bumped on every re-present so the output remounts the player (replay). */
  nonce: number
}

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
  /**
   * Readable floor for auto-fit, in design-space px (scaled by the surface).
   * Auto-fit never shrinks the verse below this. Default 8 (the hard floor).
   */
  minVerseFontSize?: number
  /**
   * Frame clock (ms) for an animated background. The animated-background engine
   * is a pure function of this time, so the caller owns the clock (RAF loop for
   * live output/preview; a fixed value in tests). Ignored unless the theme's
   * background is `type: "animated"`. Default 0.
   */
  frameTime?: number
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

/**
 * The central base background shown on the audience output when text is cleared
 * and behind any content with a transparent background. Either a full theme
 * (keeps its branding/elements) or a bare background (solid/gradient/image/
 * video — no branding). Null/absent = each output uses its own configured theme.
 */
export type BaseBackground =
  | { kind: "theme"; themeId: string }
  | { kind: "background"; background: Background }

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

// ── Verse styling ────────────────────────────────────────────────────────────
// Shared by the legacy `BroadcastTheme` and the standalone `VerseStyle` the verse
// layout + draw passes consume. Named (rather than inline on BroadcastTheme) so
// `VerseStyle` can stand alone — the live verse/slide renderer no longer depends on
// `BroadcastTheme` (themeredo.md, VR4 / VerseStyle-standalone).

export interface VerseTextBoxStyle {
  enabled: boolean
  color: string
  opacity: number
  borderRadius: number
  padding: number
}

export interface VerseNumberStyle {
  visible: boolean
  fontSize: number
  color: string
  superscript: boolean
}

export type VerseReferenceStyle = TextStyle & {
  uppercase: boolean
  position: "above" | "below" | "inline"
}

export interface VerseLayoutStyle {
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
  /**
   * Start each verse on its own line when several verses are shown together.
   * Missing/false = verses flow continuously as one wrapped block (the
   * historical behaviour).
   */
  breakPerVerse?: boolean
}

/**
 * The verse-styling subset the verse layout + draw passes
 * (`computeVerseLayoutMetrics` / `drawVerseText` / `drawReference`) actually read
 * (themeredo.md, flip VR1). Standalone — no longer `Pick<BroadcastTheme>` — so the
 * live scripture render (which builds one from a `SlideScriptureElement` via
 * `scriptureElementToVerseStyle`) does not depend on `BroadcastTheme`. A full
 * `BroadcastTheme` is structurally a `VerseStyle`, so `renderVerse`-era callers still
 * pass their theme straight in.
 */
export interface VerseStyle {
  resolution: { width: number; height: number }
  textBox: VerseTextBoxStyle
  verseText: TextStyle
  verseNumbers: VerseNumberStyle
  reference: VerseReferenceStyle
  layout: VerseLayoutStyle
}

// ── Live output content ──
// These describe content pushed to the output window(s). They live here (not in
// the store) so the broadcast-content gateway and the output window can share
// the exact same shapes without importing zustand. Re-exported from
// `stores/broadcast-store` for back-compat.

export interface BroadcastProp {
  id: string
  /**
   * `text` is a static box, `image` a cached bitmap, and `marquee` a single
   * line of text that scrolls horizontally and loops seamlessly (a ticker /
   * "crawl").
   */
  name: string
  type: "text" | "image" | "marquee"
  x: number
  y: number
  width: number
  height: number
  active: boolean
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number
  color?: string
  backgroundColor?: string
  /** Horizontal alignment of the text within the box. Defaults to "center". */
  textAlign?: "left" | "center" | "right"
  imageUrl?: string
  opacity?: number
  /** Marquee scroll speed in px/sec at a 1920px-wide canvas (scaled to output). */
  scrollSpeed?: number
  /** Marquee travel direction. Defaults to "left" (text enters from the right). */
  scrollDirection?: "left" | "right"
}

/** A media file composited beneath the live foreground on every output. */
export interface MediaLayerState {
  filePath: string
  mediaType: "image" | "video"
  name: string
  active: boolean
}

/** A media file/clip presented to the live output (image/video/audio). */
export interface LiveMedia {
  filePath: string
  mediaType: "image" | "video" | "audio"
  name: string
  /** Playback in-point in seconds (video/audio). */
  trimStart?: number
  /** Playback out-point in seconds (video/audio). */
  trimEnd?: number
  /** Loop playback between trim points. */
  loop?: boolean
  /** What to do when playback reaches the out-point / end. Defaults to "hold". */
  endAction?: MediaEndAction
  /** Named cue points for jump-to-marker. */
  markers?: MediaMarker[]
  /** How the image/video fills the output frame. Defaults to "cover". */
  fit?: MediaFit
  /** Extra scale multiplier applied when `fit` is "zoom" (>= 1). Defaults to 1. */
  zoom?: number
  /** Horizontal focal point (0..1) used when cropping. Defaults to 0.5. */
  focalX?: number
  /** Vertical focal point (0..1) used when cropping. Defaults to 0.5. */
  focalY?: number
  /** Letterbox fill when `fit` is "contain". Defaults to "black". */
  containBackground?: ContainBackground
  /** Solid color used when `containBackground` is "color". */
  containBackgroundColor?: string
}

/** The subset of a media item that controls how it fills the output frame. */
export type MediaFitUpdate = Pick<
  LiveMedia,
  | "fit"
  | "zoom"
  | "focalX"
  | "focalY"
  | "containBackground"
  | "containBackgroundColor"
>

export interface MediaTransportState {
  /** Current playback position of the live output, in seconds. */
  position: number
  /** Duration of the live media, in seconds (0 if unknown). */
  duration: number
  /** Whether the live output is currently playing. */
  playing: boolean
}

/** Live playback position echoed from the controllable YouTube overlay. */
export interface WebTransportState {
  /** Current position within the video/DVR window, in seconds. */
  position: number
  /** Duration (VOD) or seekable DVR length (live), in seconds. */
  duration: number
  /** Whether the overlay player is currently playing. */
  playing: boolean
  /** Whether the source is a live stream. */
  isLive: boolean
  /** Seconds corresponding to the live edge (0 when not live). */
  liveEdge: number
}

export interface LiveWeb {
  url: string
  isYouTube: boolean
  videoId?: string
  /** Whether this is a live stream (vs a recorded VOD). */
  isLive?: boolean
  /** Start offset in seconds (join-late / skip pre-service). */
  startTime?: number
  /** End offset in seconds (VOD only; stops before the end-screen grid). */
  endTime?: number
  /** What to do when a VOD reaches its out-point / end. Defaults to "hold". */
  endAction?: MediaEndAction
  /** Named cue points (absolute for VOD, DVR offsets for live). */
  markers?: MediaMarker[]
  /**
   * Whether the video should start playing on its own when presented. Defaults
   * to `false` (cue paused) — playback is operator-driven, so nothing auto-plays
   * on the audience output unless this is explicitly opted in per item.
   */
  autoplay?: boolean
  /**
   * Bumped on every `setLiveWeb` call. Re-presenting the same video keeps
   * `videoId`/`url` identical, so this nonce is what the operator preview keys
   * its iframe on to force a remount — i.e. replay from the start — each time
   * the item is presented again.
   */
  nonce?: number
}
