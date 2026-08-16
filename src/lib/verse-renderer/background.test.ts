import { describe, expect, it } from "vitest"
import { drawBackground } from "./background"
import type { BroadcastTheme } from "@/types/broadcast"
import type { Background } from "@/types/canvas"

/** drawBackground only reads `resolution` + `background`, so a partial suffices. */
function theme(background: Background): BroadcastTheme {
  return {
    resolution: { width: 1920, height: 1080 },
    background,
  } as BroadcastTheme
}

const solid: Background = {
  type: "solid",
  color: "#123456",
  gradient: null,
  image: null,
  video: null,
}

const animated: Background = {
  type: "solid", // overwritten below
  color: "#000000",
  gradient: null,
  image: null,
  video: null,
  animated: {
    preset: "aurora",
    palette: ["#4c1d95", "#1e3a8a", "#0ea5e9"],
    speed: 1,
    intensity: 0.7,
    baseColor: "#0b1020",
  },
}

/**
 * Recording 2D context: appends every method call and property set (with args)
 * to a flat log, so two renders can be compared for byte-level equality.
 */
function recordingCtx() {
  const log: string[] = []
  const gradient = { addColorStop: () => {} }
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient") {
        return (...a: unknown[]) => {
          log.push(`${prop}(${a.join(",")})`)
          return gradient
        }
      }
      if (prop === "canvas") return { width: 1920, height: 1080 }
      return (...args: unknown[]) => {
        log.push(`${prop}(${args.map(String).join(",")})`)
      }
    },
    set(_t, prop: string, value: unknown) {
      log.push(`set:${prop}=${String(value)}`)
      return true
    },
  }
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  return { ctx, log }
}

describe("drawBackground — animated", () => {
  it("routes an animated background through the animated engine", () => {
    const { ctx, log } = recordingCtx()
    drawBackground(ctx, theme({ ...animated, type: "animated" }), undefined, 0)
    // The animated engine paints a base wash + drifting glow blobs (radial
    // gradients), so a real animated render does far more than a solid fill.
    expect(log.some((c) => c.startsWith("createRadialGradient"))).toBe(true)
    expect(log.filter((c) => c.startsWith("fillRect")).length).toBeGreaterThan(
      1
    )
  })

  it("threads frameTime — the scene evolves over time", () => {
    const a = recordingCtx()
    drawBackground(
      a.ctx,
      theme({ ...animated, type: "animated" }),
      undefined,
      0
    )
    const b = recordingCtx()
    drawBackground(
      b.ctx,
      theme({ ...animated, type: "animated" }),
      undefined,
      500
    )
    // Motion at t=0 vs t=500 changes glow-blob positions → different gradient
    // coordinates in the call log. This fails if frameTime is dropped en route.
    expect(b.log).not.toEqual(a.log)
  })

  it("is deterministic for identical inputs (same frameTime → same calls)", () => {
    const a = recordingCtx()
    drawBackground(
      a.ctx,
      theme({ ...animated, type: "animated" }),
      undefined,
      250
    )
    const b = recordingCtx()
    drawBackground(
      b.ctx,
      theme({ ...animated, type: "animated" }),
      undefined,
      250
    )
    expect(b.log).toEqual(a.log)
  })

  it("falls back to a black fill when the animated spec is missing", () => {
    const { ctx, log } = recordingCtx()
    drawBackground(
      ctx,
      theme({ ...solid, type: "animated", animated: null }),
      undefined,
      0
    )
    expect(log.filter((c) => c.startsWith("fillRect"))).toHaveLength(1)
    expect(log.some((c) => c.startsWith("createRadialGradient"))).toBe(false)
  })
})

describe("drawBackground — non-animated types are unaffected by frameTime", () => {
  it("solid renders identically regardless of frameTime", () => {
    const a = recordingCtx()
    drawBackground(a.ctx, theme(solid), undefined, 0)
    const b = recordingCtx()
    drawBackground(b.ctx, theme(solid), undefined, 999)
    expect(b.log).toEqual(a.log)
    // Exactly one full-frame fill, no procedural work.
    expect(a.log.filter((c) => c.startsWith("fillRect"))).toHaveLength(1)
    expect(a.log.some((c) => c.startsWith("createRadialGradient"))).toBe(false)
  })
})
