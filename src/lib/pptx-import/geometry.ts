import { firstChild } from "./xml"

// ── Geometry ─────────────────────────────────────────────────────────────────
//
// Coordinate systems:
//   • PowerPoint positions/sizes are in EMU (914400 EMU = 1 inch). The Slide
//     model stores x/y/width/height as a percentage (0–100) of the slide, so we
//     divide by the slide's EMU dimensions.
//   • Font sizes in OOXML are in hundredths of a point. The renderer treats
//     `fontSize` as px on a nominal 1920×1080 canvas (`fontSize * canvasWidth/
//     1920`), i.e. px on a 1080-tall slide. So px = pt * 1080 / (72 *
//     slideHeightInches) = pt * (1080 * 12700 / slideHeightEmu).

const CANVAS_HEIGHT = 1080

export interface SlideSize {
  cx: number
  cy: number
}

export interface Xfrm {
  x: number
  y: number
  cx: number
  cy: number
}

/** Extract `<a:xfrm>` geometry (absolute EMU) from a shape's properties. */
export function readXfrm(spPr: Element | null): Xfrm | null {
  if (!spPr) return null
  const xfrm = firstChild(spPr, "a:xfrm")
  if (!xfrm) return null
  const off = firstChild(xfrm, "a:off")
  const ext = firstChild(xfrm, "a:ext")
  if (!off || !ext) return null
  const x = Number(off.getAttribute("x"))
  const y = Number(off.getAttribute("y"))
  const cx = Number(ext.getAttribute("cx"))
  const cy = Number(ext.getAttribute("cy"))
  if (![x, y, cx, cy].every(Number.isFinite)) return null
  return { x, y, cx, cy }
}

export function emuToPct(value: number, total: number): number {
  if (total <= 0) return 0
  return (value / total) * 100
}

/** Convert an OOXML point size (hundredths of a point) to model px. */
export function ptToPx(hundredthsPt: number, slideCy: number): number {
  const pt = hundredthsPt / 100
  return (pt * CANVAS_HEIGHT * 12700) / slideCy
}

export function rectFromXfrm(xfrm: Xfrm, size: SlideSize) {
  return {
    x: emuToPct(xfrm.x, size.cx),
    y: emuToPct(xfrm.y, size.cy),
    width: emuToPct(xfrm.cx, size.cx),
    height: emuToPct(xfrm.cy, size.cy),
  }
}

/** Rotation in clockwise degrees from a shape's own `<a:xfrm rot="…">`, if set. */
export function readRot(spPr: Element | null): number | undefined {
  const xfrm = spPr ? firstChild(spPr, "a:xfrm") : null
  const rot = Number(xfrm?.getAttribute("rot"))
  // OOXML `rot` is 60000ths of a degree, clockwise — as is the renderer.
  if (!Number.isFinite(rot) || rot === 0) return undefined
  return rot / 60000
}
