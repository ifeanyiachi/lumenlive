import { describe, it, expect } from "vitest"

import { drawTransitionOverlay } from "./transition-preview"
import type { SlideTransitionType } from "@/types/slide"

const W = 1920
const H = 1080

/**
 * Records the ordered sequence of 2D-context operations so we can assert the
 * exact compositing calls (parity with the editor's original inline switch).
 */
function makeRecordingCtx() {
  const calls: string[] = []
  const ctx = {
    globalAlpha: 1,
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    clip: () => calls.push("clip"),
    rect: (x: number, y: number, w: number, h: number) =>
      calls.push(`rect(${x},${y},${w},${h})`),
    drawImage: (_img: unknown, x: number, y: number, w: number, h: number) =>
      calls.push(`drawImage(${x},${y},${w},${h})`),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx }
}

const prev = {} as CanvasImageSource

function run(type: SlideTransitionType, progress: number) {
  const { ctx, calls, raw } = makeRecordingCtx()
  drawTransitionOverlay(ctx, prev, type, progress, W, H)
  return { calls, alpha: raw.globalAlpha }
}

describe("drawTransitionOverlay", () => {
  it("fade/dissolve draw the previous frame at alpha 1 - progress", () => {
    for (const type of ["fade", "dissolve"] as const) {
      const { calls, alpha } = run(type, 0.25)
      expect(alpha).toBe(0.75)
      expect(calls).toEqual(["save", `drawImage(0,0,${W},${H})`, "restore"])
    }
  })

  it("push-left slides the previous frame left by width * progress", () => {
    const { calls } = run("push-left", 0.5)
    expect(calls).toEqual([`drawImage(${-(W * 0.5)},0,${W},${H})`])
  })

  it("push-right slides the previous frame right by width * progress", () => {
    const { calls } = run("push-right", 0.5)
    expect(calls).toEqual([`drawImage(${W * 0.5},0,${W},${H})`])
  })

  it("wipe-left clips a band from wipeX to the right edge", () => {
    const progress = 0.25
    const wipeX = W * (1 - progress)
    const { calls } = run("wipe-left", progress)
    expect(calls).toEqual([
      "save",
      "beginPath",
      `rect(${wipeX},0,${W - wipeX},${H})`,
      "clip",
      `drawImage(0,0,${W},${H})`,
      "restore",
    ])
  })

  it("wipe-right clips a band from the left edge to wipeW", () => {
    const progress = 0.25
    const wipeW = W * (1 - progress)
    const { calls } = run("wipe-right", progress)
    expect(calls).toEqual([
      "save",
      "beginPath",
      `rect(0,0,${wipeW},${H})`,
      "clip",
      `drawImage(0,0,${W},${H})`,
      "restore",
    ])
  })

  it("at progress 0 a fade is fully opaque (alpha 1)", () => {
    const { alpha } = run("fade", 0)
    expect(alpha).toBe(1)
  })
})
