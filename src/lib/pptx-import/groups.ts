import { firstChild } from "./xml"
import type { Xfrm } from "./geometry"

// ── Group coordinate transforms ──────────────────────────────────────────────
//
// A <p:grpSp> establishes a child coordinate space (chOff/chExt) mapped onto the
// group's placed rectangle (off/ext) on the parent surface; nested groups
// compose. We flatten everything to absolute slide-EMU before converting to the
// model's percentages, so grouped content lands where PowerPoint drew it instead
// of being dropped.

export interface GroupTransform {
  ox: number
  oy: number
  sx: number
  sy: number
}

export const IDENTITY_TF: GroupTransform = { ox: 0, oy: 0, sx: 1, sy: 1 }

/** Map a shape's local xfrm to absolute slide-EMU under `tf`. */
export function applyTransform(xfrm: Xfrm, tf: GroupTransform): Xfrm {
  return {
    x: tf.ox + xfrm.x * tf.sx,
    y: tf.oy + xfrm.y * tf.sy,
    cx: xfrm.cx * tf.sx,
    cy: xfrm.cy * tf.sy,
  }
}

/**
 * Compose the child-space transform declared by a `<p:grpSp>` with the incoming
 * `parent` transform. Returns `parent` unchanged when the group carries no
 * usable xfrm, so its children keep the parent's mapping rather than vanishing.
 */
export function composeGroupTransform(
  grpSp: Element,
  parent: GroupTransform
): GroupTransform {
  const grpSpPr = firstChild(grpSp, "p:grpSpPr")
  const xfrm = grpSpPr ? firstChild(grpSpPr, "a:xfrm") : null
  if (!xfrm) return parent
  const off = firstChild(xfrm, "a:off")
  const ext = firstChild(xfrm, "a:ext")
  const chOff = firstChild(xfrm, "a:chOff")
  const chExt = firstChild(xfrm, "a:chExt")
  if (!off || !ext || !chOff || !chExt) return parent
  const chCx = Number(chExt.getAttribute("cx"))
  const chCy = Number(chExt.getAttribute("cy"))
  if (!chCx || !chCy) return parent

  // Local transform: childCoord → this group's parent space.
  const sx = Number(ext.getAttribute("cx")) / chCx
  const sy = Number(ext.getAttribute("cy")) / chCy
  const ox =
    Number(off.getAttribute("x")) - Number(chOff.getAttribute("x")) * sx
  const oy =
    Number(off.getAttribute("y")) - Number(chOff.getAttribute("y")) * sy
  if (![sx, sy, ox, oy].every(Number.isFinite)) return parent

  // Apply local first, then the parent transform.
  return {
    ox: parent.ox + ox * parent.sx,
    oy: parent.oy + oy * parent.sy,
    sx: sx * parent.sx,
    sy: sy * parent.sy,
  }
}
