// Pure geometry for dragging and corner-resizing an absolute-pixel box on the
// design canvas. Extracted verbatim from the element-drag path in
// `theme-canvas-overlay.tsx` so the Theme designer and the (upcoming) Stage
// Layout designer share one, tested implementation.
//
// No React / Zustand / Tauri — plain math over plain data. The caller converts
// screen deltas to canvas-pixel deltas (dxPx/dyPx) and applies the result.

/** The rectangle we operate on. A `CanvasBox` is assignable to this. */
export interface BoxRect {
  x: number
  y: number
  width: number
  height: number
}

/** The four resize handles; matches the `resize-<corner>` drag modes. */
export type BoxCorner = "nw" | "ne" | "sw" | "se"

/**
 * Minimum width/height a box may be shrunk to while resizing. Mirrors the
 * hard-coded `Math.max(20, …)` clamp in the original overlay.
 */
export const MIN_BOX_SIZE = 20

/**
 * Move a box by a canvas-pixel delta. Returns rounded top-left coordinates
 * (size is unchanged). Equivalent to the `move` branch of the element drag.
 */
export function moveBox(
  orig: BoxRect,
  dxPx: number,
  dyPx: number
): { x: number; y: number } {
  return {
    x: Math.round(orig.x + dxPx),
    y: Math.round(orig.y + dyPx),
  }
}

/**
 * Resize a box by dragging one corner by a canvas-pixel delta, keeping the
 * opposite corner fixed and clamping each dimension to `minSize`. Returns the
 * full rounded rect. Equivalent to the `resize-*` branch of the element drag.
 *
 * Note: `x`/`y` are derived from the *unrounded* width/height (rounding is
 * applied last), matching the original overlay's arithmetic exactly.
 */
export function resizeBoxCorner(
  orig: BoxRect,
  corner: BoxCorner,
  dxPx: number,
  dyPx: number,
  minSize: number = MIN_BOX_SIZE
): BoxRect {
  let newX = orig.x
  let newY = orig.y
  let newW = orig.width
  let newH = orig.height

  if (corner === "se" || corner === "ne")
    newW = Math.max(minSize, orig.width + dxPx)
  if (corner === "nw" || corner === "sw") {
    newW = Math.max(minSize, orig.width - dxPx)
    newX = orig.x + orig.width - newW
  }
  if (corner === "se" || corner === "sw")
    newH = Math.max(minSize, orig.height + dyPx)
  if (corner === "nw" || corner === "ne") {
    newH = Math.max(minSize, orig.height - dyPx)
    newY = orig.y + orig.height - newH
  }

  return {
    x: Math.round(newX),
    y: Math.round(newY),
    width: Math.round(newW),
    height: Math.round(newH),
  }
}
