import type { CSSProperties } from "react"
import type { MediaFit } from "@/types/schedule"

/** How the letterbox area is filled when an image/video is drawn with "contain". */
export type ContainBackground = "black" | "blur" | "color"

/** Frame-fit configuration for drawing an image/video onto the output canvas. */
export interface MediaFitConfig {
  fit?: MediaFit
  /** Extra scale multiplier for the "zoom" fit (>= 1). */
  zoom?: number
  /** Horizontal focal point in 0..1 (used when cropping for cover/zoom). */
  focalX?: number
  /** Vertical focal point in 0..1 (used when cropping for cover/zoom). */
  focalY?: number
  /** Letterbox fill for the "contain" fit. Defaults to "black". */
  background?: ContainBackground
  /** Solid color used when `background` is "color". */
  backgroundColor?: string
}

/** Default fit — matches the historical hard-coded "cover, centered" behavior. */
export const DEFAULT_MEDIA_FIT: Required<MediaFitConfig> = {
  fit: "cover",
  zoom: 1,
  focalX: 0.5,
  focalY: 0.5,
  background: "black",
  backgroundColor: "#000000",
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

export interface FitPlacement {
  dx: number
  dy: number
  dw: number
  dh: number
  /** True when the drawing overflows the frame (cover/zoom) — i.e. panning is meaningful. */
  overflows: boolean
}

/**
 * Compute where a `srcW`×`srcH` source lands inside a `w`×`h` frame for the given
 * fit config. Returns null when the source has no intrinsic size yet.
 */
export function computeFitPlacement(
  srcW: number,
  srcH: number,
  w: number,
  h: number,
  cfg: MediaFitConfig = DEFAULT_MEDIA_FIT
): FitPlacement | null {
  if (!srcW || !srcH) return null

  const mode = cfg.fit ?? "cover"

  if (mode === "fill") {
    return { dx: 0, dy: 0, dw: w, dh: h, overflows: false }
  }

  const base =
    mode === "contain"
      ? Math.min(w / srcW, h / srcH)
      : Math.max(w / srcW, h / srcH)
  const scale = mode === "zoom" ? base * Math.max(1, cfg.zoom ?? 1) : base

  const dw = srcW * scale
  const dh = srcH * scale

  // Focal point only steers cropping when the drawing overflows the frame
  // (cover/zoom). Contain is always centered.
  const fx = mode === "contain" ? 0.5 : clamp01(cfg.focalX ?? 0.5)
  const fy = mode === "contain" ? 0.5 : clamp01(cfg.focalY ?? 0.5)

  return {
    dx: (w - dw) * fx,
    dy: (h - dh) * fy,
    dw,
    dh,
    overflows: dw > w + 0.5 || dh > h + 0.5,
  }
}

/**
 * Draw `source` onto `ctx` filling a `w`×`h` frame according to `cfg`.
 *
 * - cover / zoom: scale to cover the frame (zoom multiplies further), crop the
 *   overflow around the focal point.
 * - contain: scale to fit inside the frame, centered, filling the letterbox
 *   area with the configured background (black / a blurred cover copy / a color).
 * - fill: stretch to the frame, ignoring the source aspect ratio.
 */
export function drawMediaFitted(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  w: number,
  h: number,
  cfg: MediaFitConfig = DEFAULT_MEDIA_FIT
): void {
  const srcW =
    source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth
  const srcH =
    source instanceof HTMLVideoElement
      ? source.videoHeight
      : source.naturalHeight
  const placement = computeFitPlacement(srcW, srcH, w, h, cfg)
  if (!placement) return

  const mode = cfg.fit ?? "cover"

  // Letterbox background for contain (other modes fill the whole frame).
  if (mode === "contain") {
    const bg = cfg.background ?? "black"
    if (bg === "color") {
      ctx.fillStyle = cfg.backgroundColor || "#000000"
      ctx.fillRect(0, 0, w, h)
    } else if (bg === "blur") {
      const cover = computeFitPlacement(srcW, srcH, w, h, { fit: "cover" })
      if (cover) {
        ctx.save()
        // Blur radius scales with frame size so it looks consistent at any resolution.
        ctx.filter = `blur(${Math.round(Math.max(w, h) * 0.025)}px)`
        // Slight overscan hides the transparent halo blur leaves at the edges.
        const pad = Math.max(w, h) * 0.06
        ctx.drawImage(
          source,
          cover.dx - pad,
          cover.dy - pad,
          cover.dw + pad * 2,
          cover.dh + pad * 2
        )
        ctx.restore()
        ctx.fillStyle = "rgba(0,0,0,0.15)"
        ctx.fillRect(0, 0, w, h)
      }
    }
    // "black": caller has already painted black behind us.
  }

  ctx.drawImage(source, placement.dx, placement.dy, placement.dw, placement.dh)
}

/**
 * CSS equivalent of {@link drawMediaFitted} for DOM `<img>`/`<video>` monitors
 * (the operator Program/Preview panels). Apply to the media element itself; the
 * element's container must be `overflow: hidden` so the "zoom" scale is clipped.
 * Contain-mode letterbox backgrounds are handled separately by a backdrop layer.
 */
export function mediaFitStyle(cfg: MediaFitConfig): CSSProperties {
  const mode = cfg.fit ?? "cover"
  const fx = clamp01(cfg.focalX ?? 0.5) * 100
  const fy = clamp01(cfg.focalY ?? 0.5) * 100

  if (mode === "fill") return { objectFit: "fill", objectPosition: "center" }
  if (mode === "contain")
    return { objectFit: "contain", objectPosition: "center" }

  // cover & zoom
  const style: CSSProperties = {
    objectFit: "cover",
    objectPosition: `${fx}% ${fy}%`,
  }
  if (mode === "zoom") {
    style.transform = `scale(${Math.max(1, cfg.zoom ?? 1)})`
    style.transformOrigin = `${fx}% ${fy}%`
  }
  return style
}

// --- App-wide default fit (persisted) --------------------------------------

const DEFAULT_FIT_KEY = "lumenlive.mediaFitDefault"

/** Fields of a media item that make up its fit configuration. */
export interface MediaFitFields {
  fit?: MediaFit
  zoom?: number
  focalX?: number
  focalY?: number
  containBackground?: ContainBackground
  containBackgroundColor?: string
}

/** Read the user's saved default fit for new media items (empty object if none). */
export function getDefaultMediaFit(): MediaFitFields {
  try {
    const raw = localStorage.getItem(DEFAULT_FIT_KEY)
    return raw ? (JSON.parse(raw) as MediaFitFields) : {}
  } catch {
    return {}
  }
}

/** Persist the default fit applied to newly-added media items. */
export function setDefaultMediaFit(fields: MediaFitFields): void {
  try {
    localStorage.setItem(DEFAULT_FIT_KEY, JSON.stringify(fields))
  } catch {
    /* ignore quota / unavailable storage */
  }
}
