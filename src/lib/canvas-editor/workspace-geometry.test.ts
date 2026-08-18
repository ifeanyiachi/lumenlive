import { describe, it, expect } from "vitest"
import { anchorPosition } from "@/lib/verse-renderer"
import type { BroadcastTheme } from "@/types"
import {
  WS_WIDTH,
  WS_HEIGHT,
  computeTextAreaPct,
  rectToPct,
  resizeKeepingCornerFixed,
} from "./workspace-geometry"

// Parity tests: each extracted function is checked against a verbatim copy of
// the arithmetic that previously lived inline in `theme-canvas-overlay.tsx`,
// across a grid of anchors / corners / sizes. Both paths call the same real
// `anchorPosition`, so these guard the extracted math against future drift.

type Anchor = BroadcastTheme["layout"]["anchor"]

const ANCHORS: Anchor[] = [
  "center",
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]

const CORNERS = ["nw", "ne", "sw", "se"] as const

// ---- Legacy inline implementations (copied verbatim from the old overlay) ----

function legacyTextAreaPct(layout: BroadcastTheme["layout"]) {
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

function legacyRectToPct(rect: {
  x: number
  y: number
  width: number
  height: number
}) {
  return {
    x: (rect.x / WS_WIDTH) * 100,
    y: (rect.y / WS_HEIGHT) * 100,
    width: (rect.width / WS_WIDTH) * 100,
    height: (rect.height / WS_HEIGHT) * 100,
  }
}

function legacyResizeKeepingCornerFixed(
  anchor: Anchor,
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

// ---- Tests ----

describe("computeTextAreaPct", () => {
  it("matches the legacy inline text-area layout math across a grid", () => {
    for (const anchor of ANCHORS) {
      for (const bgW of [50, 80, 100]) {
        for (const bgH of [40, 70, 100]) {
          for (const [offX, offY] of [
            [0, 0],
            [120, -80],
            [-300, 250],
          ]) {
            const layout = {
              anchor,
              offsetX: offX,
              offsetY: offY,
              backgroundWidth: bgW,
              backgroundHeight: bgH,
              textAreaWidth: 90,
              textAreaHeight: 60,
            } as BroadcastTheme["layout"]
            expect(computeTextAreaPct(layout)).toEqual(
              legacyTextAreaPct(layout)
            )
          }
        }
      }
    }
  })
})

describe("rectToPct", () => {
  it("matches the legacy inline pixel→percent conversion", () => {
    for (const rect of [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 480, y: 270, width: 960, height: 540 },
      { x: 123, y: 456, width: 789, height: 321 },
    ]) {
      expect(rectToPct(rect)).toEqual(legacyRectToPct(rect))
    }
  })
})

describe("resizeKeepingCornerFixed", () => {
  it("matches the legacy inline corner-resize math across a grid", () => {
    for (const anchor of ANCHORS) {
      for (const corner of CORNERS) {
        for (const [ow, oh] of [
          [400, 300],
          [960, 540],
        ]) {
          for (const [nw, nh] of [
            [200, 150],
            [800, 700],
          ]) {
            for (const [ox, oy] of [
              [0, 0],
              [150, -120],
            ]) {
              expect(
                resizeKeepingCornerFixed(anchor, ox, oy, ow, oh, nw, nh, corner)
              ).toEqual(
                legacyResizeKeepingCornerFixed(
                  anchor,
                  ox,
                  oy,
                  ow,
                  oh,
                  nw,
                  nh,
                  corner
                )
              )
            }
          }
        }
      }
    }
  })
})
