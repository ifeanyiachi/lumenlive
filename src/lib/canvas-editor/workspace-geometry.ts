// Pure workspace-geometry math for the Theme designer's editing overlay:
// converting theme layout into percentage/screen rectangles and resizing the
// text-area/background box while keeping the opposite corner fixed. Extracted
// verbatim from `theme-canvas-overlay.tsx` so the drag/resize arithmetic is
// unit-tested and cannot silently drift when the overlay UI is refactored.
//
// No React / Zustand / Tauri — plain math over plain data. The design space is
// a fixed 1920×1080 workspace; callers scale to on-screen pixels separately.

import { anchorPosition } from "@/lib/verse-renderer"
import type { BroadcastTheme } from "@/types"

/** Broadcast workspace dimensions (design space is a fixed 1920×1080). */
export const WS_WIDTH = 1920
export const WS_HEIGHT = 1080

/** A rectangle in 0–100 percentage-of-workspace space. */
export interface PctRect {
  x: number
  y: number
  width: number
  height: number
}

/** A rectangle in absolute workspace pixels. */
export interface PxRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Text-area rectangle (percentage of the workspace) derived from theme layout:
 * background size, text-area size relative to it, and anchor + offset.
 */
export function computeTextAreaPct(layout: BroadcastTheme["layout"]): PctRect {
  const bgWpx = (layout.backgroundWidth / 100) * WS_WIDTH
  const bgHpx = (layout.backgroundHeight / 100) * WS_HEIGHT
  const taWpx = (layout.textAreaWidth / 100) * bgWpx
  const taHpx = (layout.textAreaHeight / 100) * bgHpx
  const pos = anchorPosition(
    layout.anchor,
    taWpx,
    taHpx,
    WS_WIDTH,
    WS_HEIGHT,
    layout.offsetX,
    layout.offsetY
  )
  return {
    x: (pos.x / WS_WIDTH) * 100,
    y: (pos.y / WS_HEIGHT) * 100,
    width: (taWpx / WS_WIDTH) * 100,
    height: (taHpx / WS_HEIGHT) * 100,
  }
}

/** Convert an absolute-pixel workspace rect to percentage space. */
export function rectToPct(rect: PxRect): PctRect {
  return {
    x: (rect.x / WS_WIDTH) * 100,
    y: (rect.y / WS_HEIGHT) * 100,
    width: (rect.width / WS_WIDTH) * 100,
    height: (rect.height / WS_HEIGHT) * 100,
  }
}

/**
 * Resize the text-area/background box so one corner moves to a new size while
 * the diagonally-opposite corner stays pinned, then re-derive the layout offset
 * relative to the anchor. Returns the new `offsetX`/`offsetY` (in workspace
 * pixels). Extracted verbatim from the resize branch of the overlay drag.
 */
export function resizeKeepingCornerFixed(
  anchor: BroadcastTheme["layout"]["anchor"],
  origOffsetX: number,
  origOffsetY: number,
  origWpx: number,
  origHpx: number,
  newWpx: number,
  newHpx: number,
  fixedCorner: "nw" | "ne" | "sw" | "se"
): { offsetX: number; offsetY: number } {
  const origBase = anchorPosition(
    anchor,
    origWpx,
    origHpx,
    WS_WIDTH,
    WS_HEIGHT,
    0,
    0
  )
  const newBase = anchorPosition(
    anchor,
    newWpx,
    newHpx,
    WS_WIDTH,
    WS_HEIGHT,
    0,
    0
  )

  const origAbsX = origBase.x + origOffsetX
  const origAbsY = origBase.y + origOffsetY

  let fixedX: number
  let fixedY: number
  switch (fixedCorner) {
    case "nw":
      fixedX = origAbsX
      fixedY = origAbsY
      break
    case "ne":
      fixedX = origAbsX + origWpx
      fixedY = origAbsY
      break
    case "sw":
      fixedX = origAbsX
      fixedY = origAbsY + origHpx
      break
    case "se":
      fixedX = origAbsX + origWpx
      fixedY = origAbsY + origHpx
      break
  }

  let newAbsX: number
  let newAbsY: number
  switch (fixedCorner) {
    case "nw":
      newAbsX = fixedX
      newAbsY = fixedY
      break
    case "ne":
      newAbsX = fixedX - newWpx
      newAbsY = fixedY
      break
    case "sw":
      newAbsX = fixedX
      newAbsY = fixedY - newHpx
      break
    case "se":
      newAbsX = fixedX - newWpx
      newAbsY = fixedY - newHpx
      break
  }

  return {
    offsetX: newAbsX - newBase.x,
    offsetY: newAbsY - newBase.y,
  }
}
