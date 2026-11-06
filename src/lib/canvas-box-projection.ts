import type { CanvasAnchor, CanvasBox } from "@/types/canvas"
import { surfaceFontScale } from "@/lib/canvas-constants"

/**
 * Re-anchor + scale a positioned box (theme element or stage zone), authored in
 * absolute pixels on a design canvas, onto a real output surface — so it stays
 * pinned to its corner/edge when the output reflows to another aspect ratio.
 *
 * The box's size scales by the shorter-axis factor (like text) and its anchored
 * margin is preserved (scaled): a right-anchored box keeps its right margin, a
 * centered one stays centered. Two guarantees make this safe to adopt: at the
 * authored resolution it is a no-op (byte-identical), and on any 16:9 surface
 * every anchor reduces to the old uniform scaling — so only genuinely non-16:9
 * surfaces change, and only for the better.
 */

type Horizontal = "left" | "center" | "right"
type Vertical = "top" | "middle" | "bottom"

function decompose(anchor: CanvasAnchor): { h: Horizontal; v: Vertical } {
  switch (anchor) {
    case "center":
      return { h: "center", v: "middle" }
    case "top-left":
      return { h: "left", v: "top" }
    case "top-center":
      return { h: "center", v: "top" }
    case "top-right":
      return { h: "right", v: "top" }
    case "bottom-left":
      return { h: "left", v: "bottom" }
    case "bottom-center":
      return { h: "center", v: "bottom" }
    case "bottom-right":
      return { h: "right", v: "bottom" }
  }
}

/**
 * Best-fit anchor for a box from its center within the authored canvas, used when
 * a box predates the `anchor` field. Thirds split each axis into near/center/far;
 * the mid row has no side anchors, so a mid-left/right box snaps its vertical to
 * the nearer of top/bottom.
 */
export function deriveBoxAnchor(
  box: { x: number; y: number; width: number; height: number },
  authored: { width: number; height: number }
): CanvasAnchor {
  const cxFrac = (box.x + box.width / 2) / authored.width
  const cyFrac = (box.y + box.height / 2) / authored.height
  const h: Horizontal =
    cxFrac < 1 / 3 ? "left" : cxFrac > 2 / 3 ? "right" : "center"
  const v: Vertical =
    cyFrac < 1 / 3 ? "top" : cyFrac > 2 / 3 ? "bottom" : "middle"
  if (v === "middle" && h === "center") return "center"
  const vv: "top" | "bottom" =
    v === "middle" ? (cyFrac < 0.5 ? "top" : "bottom") : v
  return `${vv}-${h}` as CanvasAnchor
}

export function projectBoxToSurface<T extends CanvasBox>(
  box: T,
  authored: { width: number; height: number },
  surface: { width: number; height: number }
): T {
  const fs = surfaceFontScale(surface.width, surface.height)
  const sizeScale = box.sizeMode === "fixed" ? 1 : fs
  const nw = box.width * sizeScale
  const nh = box.height * sizeScale
  const anchor = box.anchor ?? deriveBoxAnchor(box, authored)
  const { h, v } = decompose(anchor)

  let nx: number
  switch (h) {
    case "left":
      nx = box.x * fs
      break
    case "right":
      nx = surface.width - (authored.width - (box.x + box.width)) * fs - nw
      break
    case "center":
      nx =
        surface.width / 2 +
        (box.x + box.width / 2 - authored.width / 2) * fs -
        nw / 2
      break
  }

  let ny: number
  switch (v) {
    case "top":
      ny = box.y * fs
      break
    case "bottom":
      ny = surface.height - (authored.height - (box.y + box.height)) * fs - nh
      break
    case "middle":
      ny =
        surface.height / 2 +
        (box.y + box.height / 2 - authored.height / 2) * fs -
        nh / 2
      break
  }

  return { ...box, x: nx, y: ny, width: nw, height: nh }
}
