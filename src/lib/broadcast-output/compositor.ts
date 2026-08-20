/**
 * Broadcast-output compositor — the pure frame-drawing core of the output window.
 *
 * This is the compositor seam extracted out of `broadcast-output.tsx` (S2). The
 * component still owns the canvas element, the surface/NDI resolution, the RAF
 * loops, and all the mutable refs; this module owns only the *drawing*: given a
 * 2D context sized to `sw × sh` and a plain snapshot of the output's live state,
 * paint one frame.
 *
 * Two entry points mirror the two things the component draws:
 *   - {@link composeFrame} — the opaque program frame (the audience projector /
 *     the default NDI copy): black floor → media layer → content (stage / clear /
 *     media / slide / verse) → overlays → holding logo → blackout.
 *   - {@link composeNdiForeground} — the see-through (keyable) NDI frame: ONLY
 *     the foreground graphics (verse text / slide elements + overlays) on a
 *     transparent canvas, omitting the black floor, base theme, and media layer
 *     that the opaque program draws — those are the backdrop a downstream switcher
 *     supplies.
 *
 * Both are pure over {@link CompositorState}: no refs, no DOM ownership, no timing
 * — the caller injects `frameTime`/`now` — so a given state renders the same op
 * sequence every time (golden-frame testable; see `compositor.test.ts`).
 *
 * Internals are decomposed (S2 Phase 2) so the layering rules live in one place:
 *   - {@link paintProgramBase} — the black floor + optional media layer that every
 *     transparent-content branch composits over.
 *   - `renderStage/Clear/Media/Slide/Verse` — one per content branch.
 *   - {@link paintOverlays} + {@link paintLogoAndBlackout} — the shared finishers.
 *   - {@link buildSlideRenderOpts} / {@link buildVerseRenderOpts} — the render-option
 *     construction shared by the program frame and the keyed NDI foreground.
 */

import { renderVerse } from "@/lib/verse-renderer"
import {
  renderSlide,
  drawSlideElements,
  type SlideRenderOptions,
} from "@/lib/slide-renderer"
import {
  drawStageDisplay,
  type StageDisplayData,
} from "@/lib/stage-display-renderer"
import {
  drawMediaFitted,
  DEFAULT_MEDIA_FIT,
  type MediaFitConfig,
} from "@/lib/media-fit"
import {
  drawAlertOverlay,
  drawCountdownOverlay,
  drawPropsOverlay,
} from "./overlays"
import { isAnimationActive } from "@/lib/slide-animation"
import type { SlideAnimationTracker } from "@/lib/slide-animation"
import type {
  BroadcastTheme,
  LayerFilter,
  BroadcastProp,
  MediaLayerState,
  VerseRenderData,
  RenderOptions,
} from "@/types/broadcast"
import type { Slide } from "@/types/slide"
import type {
  AlertTemplate,
  ActiveAlert,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"

/**
 * A plain, read-only snapshot of everything the compositor needs to paint one
 * frame. The component builds this from its refs each draw; the compositor never
 * reaches back for live state. Structurally typed so the component can pass its
 * cached payloads (`VerseUpdatePayload`, `SlideUpdatePayload`) directly.
 */
export interface CompositorState {
  /** Output window mode from the URL hash — `"stage"` renders the stage display. */
  outputMode: string
  /** Latest stage-display payload (only used when `outputMode === "stage"`). */
  stageData: StageDisplayData | null
  imageCache: Map<string, HTMLImageElement>
  videoCache: Map<string, HTMLVideoElement>
  /** Per-output layer filter; `null` means "show everything". */
  layerFilter: LayerFilter | null
  /** Clear reveals the base theme with no content text. */
  clearForeground: boolean
  activeMode: "verse" | "slide" | "media"
  latestData: { theme: BroadcastTheme; verse: VerseRenderData | null } | null
  latestSlide: { slide: Slide } | null
  latestMedia: { img: HTMLImageElement } | null
  /** Video media paused with a "stop" end-action: paint black, not the frame. */
  mediaBlank: boolean
  mediaVideo: HTMLVideoElement | null
  mediaFit: MediaFitConfig
  slideAnimTracker: SlideAnimationTracker | null
  /** Central base/master theme composited behind Clear and transparent content. */
  baseTheme: BroadcastTheme | null
  mediaLayer: MediaLayerState | null
  mediaLayerImg: HTMLImageElement | null
  mediaLayerVideo: HTMLVideoElement | null
  props: BroadcastProp[]
  alerts: { alert: ActiveAlert; template: AlertTemplate }[]
  countdowns: {
    countdown: ActiveCountdown
    timer: CountdownTimer
    theme?: BroadcastTheme
  }[]
  showLogo: boolean
  logoImg: HTMLImageElement | null
  blackout: boolean
  verseAutoFit: boolean
  maxVerseScale: number
  minVerseFontSize: number
  /** Monotonic frame clock (e.g. `performance.now()`) for animated content. */
  frameTime: number
  /** Wall clock (e.g. `Date.now()`) for time-driven overlays (countdowns/marquee). */
  now: number
  /** Optional hook fired when `renderVerse` returns null and a fallback is drawn. */
  onNullVerse?: () => void
}

/** Whether the media layer is present AND not hidden by the active layer filter. */
function hasVisibleMediaLayer(s: CompositorState): boolean {
  return (
    s.mediaLayer !== null && (!s.layerFilter || s.layerFilter.showMediaLayer)
  )
}

/** Draw the active media layer (image/video) fitted to the surface. No-op when absent. */
function paintMediaLayer(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  if (!s.mediaLayer) return
  if (s.mediaLayer.mediaType === "image" && s.mediaLayerImg) {
    drawMediaFitted(ctx, s.mediaLayerImg, sw, sh, DEFAULT_MEDIA_FIT)
  } else if (
    s.mediaLayer.mediaType === "video" &&
    s.mediaLayerVideo &&
    s.mediaLayerVideo.readyState >= 2
  ) {
    drawMediaFitted(ctx, s.mediaLayerVideo, sw, sh, DEFAULT_MEDIA_FIT)
  }
}

/**
 * The transparent-compositing base shared by every branch that composits content
 * over a backdrop (clear / media / transparent slide / verse): a black floor, then
 * the media layer beneath the content. Centralized so the "floor + media layer"
 * rule is spelled out exactly once.
 */
function paintProgramBase(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  ctx.fillStyle = "#000"
  ctx.fillRect(0, 0, sw, sh)
  if (hasVisibleMediaLayer(s)) paintMediaLayer(ctx, sw, sh, s)
}

/**
 * Draw the central base theme's backdrop (background + decorative elements, no
 * verse text) onto the surface. Used for Clear and behind transparent content.
 * No-op until a base theme is present.
 */
function paintBaseTheme(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  const bt = s.baseTheme
  if (!bt) return
  renderVerse(ctx, bt, null, {
    scale: 1,
    imageCache: s.imageCache,
    surface: { width: sw, height: sh },
    frameTime: s.frameTime,
  })
}

/** Build slide render options, honouring the active entry-animation tracker. */
function buildSlideRenderOpts(s: CompositorState): SlideRenderOptions {
  const renderOpts: SlideRenderOptions = { frameTime: s.frameTime, now: s.now }
  const tracker = s.slideAnimTracker
  if (tracker && isAnimationActive(tracker)) {
    renderOpts.animationStates = tracker.elementStates
    renderOpts.textBuildProgress = tracker.textBuildProgress
  }
  return renderOpts
}

/** Build verse render options (surface projection + auto-fit) for the live output. */
function buildVerseRenderOpts(
  s: CompositorState,
  sw: number,
  sh: number
): RenderOptions {
  return {
    // Decorative elements are re-anchored to the surface inside the verse
    // renderer (per-element anchors), so no uniform element scale here.
    scale: 1,
    imageCache: s.imageCache,
    surface: { width: sw, height: sh },
    verseAutoFit: s.verseAutoFit,
    maxVerseScale: s.maxVerseScale,
    minVerseFontSize: s.minVerseFontSize,
    frameTime: s.frameTime,
  }
}

/**
 * Stage branch: reflow the stage display to the surface (drawStageDisplay applies
 * a uniform scale + zone re-anchor). Native fills the monitor; NDI/custom follow
 * the surface. Assumes `s.stageData` is present (checked by the caller).
 */
function renderStage(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  drawStageDisplay(ctx, sw, sh, s.stageData!, s.imageCache, s.videoCache)
}

/**
 * Clear branch: reveal the central base theme (its background + branding) with no
 * content text — consistent across verse / slide / song. The media layer sits
 * beneath it.
 */
function renderClear(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  paintProgramBase(ctx, sw, sh, s)
  paintBaseTheme(ctx, sw, sh, s)
}

/** Media branch: fill the surface with the fitted image, or the live video frame. */
function renderMedia(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  paintProgramBase(ctx, sw, sh, s)
  const showContent = !s.layerFilter || s.layerFilter.showContent
  if (showContent && s.latestMedia) {
    drawMediaFitted(ctx, s.latestMedia.img, sw, sh, s.mediaFit)
  } else if (!s.mediaBlank && s.mediaVideo && s.mediaVideo.readyState >= 2) {
    drawMediaFitted(ctx, s.mediaVideo, sw, sh, s.mediaFit)
  }
}

/**
 * Slide branch: transparent slides composit over the base theme (drawing the
 * ELEMENTS directly, since renderSlide's transparent background would clearRect
 * the base theme away); opaque slides go straight through renderSlide. Assumes
 * `s.latestSlide` is present (checked by the caller).
 */
function renderSlideContent(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  const { slide } = s.latestSlide!
  const renderOpts = buildSlideRenderOpts(s)
  if (slide.background.type === "transparent") {
    paintProgramBase(ctx, sw, sh, s)
    paintBaseTheme(ctx, sw, sh, s)
    drawSlideElements(
      ctx,
      slide,
      sw,
      sh,
      { imageCache: s.imageCache, videoCache: s.videoCache },
      renderOpts
    )
  } else {
    renderSlide(ctx, slide, sw, sh, s.imageCache, s.videoCache, renderOpts)
  }
}

/**
 * Verse branch (also the fallback when no slide is live): reflow the theme onto
 * the surface. Transparent verse themes composit over the base theme (only when it
 * differs from the verse's own theme, else renderVerse would draw it twice). A
 * null render result repaints the black fallback and notifies the caller.
 */
function renderVerseContent(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  const data = s.latestData
  if (!data) {
    paintProgramBase(ctx, sw, sh, s)
    return
  }
  const { theme, verse } = data
  if (theme.background.type === "transparent") {
    paintProgramBase(ctx, sw, sh, s)
    if (s.baseTheme && s.baseTheme.id !== theme.id) {
      paintBaseTheme(ctx, sw, sh, s)
    }
  }
  const result = renderVerse(ctx, theme, verse, buildVerseRenderOpts(s, sw, sh))
  if (!result) {
    paintProgramBase(ctx, sw, sh, s)
    s.onNullVerse?.()
  }
}

/** The foreground overlays (props / alerts / countdowns), each gated by the filter. */
function paintOverlays(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  const lf = s.layerFilter
  if (!lf || lf.showProps)
    drawPropsOverlay(ctx, sw, sh, s.props, s.imageCache, s.now)
  if (!lf || lf.showAlerts) drawAlertOverlay(ctx, sw, sh, s.alerts)
  if (!lf || lf.showCountdowns)
    drawCountdownOverlay(ctx, sw, sh, s.countdowns, s.now)
}

/**
 * The two program finishers, in order:
 *   - "Logo": a holding image over content + overlays, on black. Shown as a black
 *     holding screen until the image finishes loading.
 *   - "Black": a full cut to black over everything (logo included) — the final
 *     word. The NDI copy reads this same surface, so the feed blacks out too.
 */
function paintLogoAndBlackout(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  if (s.showLogo) {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, sw, sh)
    if (s.logoImg) {
      drawMediaFitted(ctx, s.logoImg, sw, sh, {
        ...DEFAULT_MEDIA_FIT,
        fit: "contain",
      })
    }
  }
  if (s.blackout) {
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, sw, sh)
  }
}

/**
 * Paint one opaque program frame onto a context already sized to `sw × sh`.
 * The stage branch returns early (no overlays); every other branch flows through
 * overlays → logo → blackout so the last two always win.
 */
export function composeFrame(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  if (s.outputMode === "stage" && s.stageData) {
    renderStage(ctx, sw, sh, s)
    return
  }

  if (s.clearForeground) {
    renderClear(ctx, sw, sh, s)
  } else if (s.activeMode === "media") {
    renderMedia(ctx, sw, sh, s)
  } else if (s.activeMode === "slide" && s.latestSlide) {
    renderSlideContent(ctx, sw, sh, s)
  } else {
    renderVerseContent(ctx, sw, sh, s)
  }

  paintOverlays(ctx, sw, sh, s)
  paintLogoAndBlackout(ctx, sw, sh, s)
}

/**
 * Render ONLY the foreground graphics (verse text / slide elements + overlays)
 * onto a transparent context, for a see-through (keyable) NDI feed. Deliberately
 * omits the black floor, the central base theme, and the media layer that the
 * opaque program draws — those are the backdrop a downstream switcher supplies.
 * Only ever called when the content actually qualifies as transparent.
 */
export function composeNdiForeground(
  ctx: CanvasRenderingContext2D,
  sw: number,
  sh: number,
  s: CompositorState
): void {
  ctx.clearRect(0, 0, sw, sh)
  if (s.activeMode === "slide" && s.latestSlide) {
    drawSlideElements(
      ctx,
      s.latestSlide.slide,
      sw,
      sh,
      { imageCache: s.imageCache, videoCache: s.videoCache },
      buildSlideRenderOpts(s)
    )
  } else if (s.activeMode === "verse" && s.latestData) {
    const { theme, verse } = s.latestData
    renderVerse(ctx, theme, verse, buildVerseRenderOpts(s, sw, sh))
  }
  // Foreground overlays belong in the keyed feed too — same gating as the program.
  paintOverlays(ctx, sw, sh, s)
}
