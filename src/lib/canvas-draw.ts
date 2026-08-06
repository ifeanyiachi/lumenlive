import { computeFitPlacement } from "@/lib/media-fit"

/**
 * Canvas-drawing primitives shared by the two output renderers
 * (`verse-renderer.ts` and `slide-renderer.ts`).
 *
 * Both renderers historically hand-rolled the same background/text math, and it
 * drifted apart (e.g. only the verse renderer honored `capitalize`). This module
 * is the single source of truth for those primitives so the two paths stay in
 * lockstep. It is pure geometry/string work — no canvas state mutation beyond
 * what the caller passes coordinates into.
 */

/** Text-case transform vocabulary understood by the renderers. */
export type CanvasTextTransform =
  "none" | "uppercase" | "lowercase" | "capitalize"

/**
 * Apply a CSS-style text-transform to `text`.
 *
 * `capitalize` upper-cases the first letter of every word. Callers whose data
 * model cannot express `capitalize` (e.g. slide text elements) simply never pass
 * it — the wider union is a superset, so behavior is unchanged for them.
 */
export function applyTextTransform(
  text: string,
  transform: CanvasTextTransform
): string {
  switch (transform) {
    case "uppercase":
      return text.toUpperCase()
    case "lowercase":
      return text.toLowerCase()
    case "capitalize":
      return text.replace(/\b\w/g, (char) => char.toUpperCase())
    case "none":
    default:
      return text
  }
}

/**
 * Endpoints for a CSS-style linear gradient at `angleDeg` spanning a
 * `width`×`height` canvas, returned as `[x0, y0, x1, y1]` ready for
 * `ctx.createLinearGradient(...)`. The gradient line passes through the canvas
 * center and is long enough to cover the full diagonal. 0° runs left→right;
 * the angle increases clockwise in canvas (y-down) space.
 */
export function linearGradientCoords(
  width: number,
  height: number,
  angleDeg: number
): [number, number, number, number] {
  const angle = (angleDeg * Math.PI) / 180
  const cx = width / 2
  const cy = height / 2
  const len = Math.sqrt(width * width + height * height) / 2
  return [
    cx - Math.cos(angle) * len,
    cy - Math.sin(angle) * len,
    cx + Math.cos(angle) * len,
    cy + Math.sin(angle) * len,
  ]
}

/** Background fit modes (a subset of the media-library {@link MediaFit} vocabulary). */
export type BackgroundFit = "cover" | "contain" | "stretch"

/** Destination rectangle for `ctx.drawImage(source, x, y, w, h)`. */
export interface DrawRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Where a `srcW`×`srcH` source lands when drawn to `cover` / `contain` /
 * `stretch` a `dstW`×`dstH` canvas, centered. `stretch` fills the whole canvas;
 * `cover`/`contain` delegate to {@link computeFitPlacement} (focal-centered),
 * which is the app-wide fit authority. Falls back to a full-canvas stretch when
 * the source has no intrinsic size yet (image/video not decoded).
 */
export function fitBackgroundRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: BackgroundFit
): DrawRect {
  if (fit === "stretch") {
    return { x: 0, y: 0, w: dstW, h: dstH }
  }
  const placement = computeFitPlacement(srcW, srcH, dstW, dstH, { fit })
  if (!placement) {
    return { x: 0, y: 0, w: dstW, h: dstH }
  }
  return { x: placement.dx, y: placement.dy, w: placement.dw, h: placement.dh }
}
