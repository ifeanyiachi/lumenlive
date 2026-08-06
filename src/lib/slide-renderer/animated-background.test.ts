import { describe, expect, it } from "vitest"
import {
  computeAnimatedScene,
  drawAnimatedBackground,
} from "./animated-background"
import type { AnimatedBackground } from "@/types/slide"

function spec(overrides: Partial<AnimatedBackground> = {}): AnimatedBackground {
  return {
    preset: "aurora",
    palette: ["#7c3aed", "#2563eb", "#0ea5e9"],
    speed: 1,
    intensity: 0.7,
    ...overrides,
  }
}

/** Recording 2D context: records call names, returns gradient stubs. */
function recordingCtx() {
  const calls: string[] = []
  const gradient = { addColorStop() {} }
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "createLinearGradient" || prop === "createRadialGradient")
        return () => gradient
      if (prop === "canvas") return { width: 1920, height: 1080 }
      return (...args: unknown[]) => {
        void args
        calls.push(prop)
      }
    },
    set() {
      return true
    },
  }
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe("computeAnimatedScene", () => {
  it("is deterministic for identical inputs", () => {
    const a = computeAnimatedScene(spec(), 1920, 1080, 1234)
    const b = computeAnimatedScene(spec(), 1920, 1080, 1234)
    expect(a).toEqual(b)
  })

  it("evolves over time (particles/blobs move)", () => {
    const t0 = computeAnimatedScene(spec(), 1920, 1080, 0)
    const t1 = computeAnimatedScene(spec(), 1920, 1080, 500)
    expect(t1).not.toEqual(t0)
    // Blob positions specifically change.
    expect(t1.blobs[0].x).not.toBe(t0.blobs[0].x)
  })

  it("intensity scales particle count; 0 yields none", () => {
    const none = computeAnimatedScene(spec({ intensity: 0 }), 1920, 1080, 100)
    const some = computeAnimatedScene(spec({ intensity: 1 }), 1920, 1080, 100)
    expect(none.particles).toHaveLength(0)
    expect(some.particles.length).toBeGreaterThan(0)
  })

  it("clamps intensity out of range without throwing", () => {
    expect(() =>
      computeAnimatedScene(spec({ intensity: 5 }), 1920, 1080, 10)
    ).not.toThrow()
    expect(() =>
      computeAnimatedScene(spec({ intensity: -2 }), 1920, 1080, 10)
    ).not.toThrow()
  })

  it("falls back to defaults for an empty palette", () => {
    const scene = computeAnimatedScene(spec({ palette: [] }), 1920, 1080, 0)
    expect(scene.baseStops.length).toBeGreaterThan(0)
    expect(scene.blobs.length).toBeGreaterThan(0)
  })

  it("handles zero/negative speed by treating it as design speed", () => {
    const still = computeAnimatedScene(spec({ speed: 0 }), 1920, 1080, 1000)
    // With speed coerced to 1, the scene equals a speed-1 render at the same t.
    const ref = computeAnimatedScene(spec({ speed: 1 }), 1920, 1080, 1000)
    expect(still).toEqual(ref)
  })

  it("scales particle size with resolution", () => {
    const big = computeAnimatedScene(spec({ intensity: 1 }), 1920, 1080, 50)
    const small = computeAnimatedScene(spec({ intensity: 1 }), 192, 108, 50)
    expect(small.particles[0].radius).toBeLessThan(big.particles[0].radius)
  })

  it("every preset computes a deterministic scene without throwing", () => {
    for (const preset of [
      "aurora",
      "bokeh",
      "embers",
      "starfield",
      "snow",
      "godrays",
      "gradient-drift",
    ] as const) {
      const a = computeAnimatedScene(spec({ preset }), 1920, 1080, 42)
      const b = computeAnimatedScene(spec({ preset }), 1920, 1080, 42)
      expect(a).toEqual(b)
    }
  })

  it("godrays emits beams; other presets do not", () => {
    const rays = computeAnimatedScene(
      spec({ preset: "godrays" }),
      1920,
      1080,
      10
    )
    expect(rays.beams.length).toBeGreaterThan(0)
    const aurora = computeAnimatedScene(
      spec({ preset: "aurora" }),
      1920,
      1080,
      10
    )
    expect(aurora.beams).toHaveLength(0)
  })

  it("gradient-drift emits no particles but does emit blobs", () => {
    const gd = computeAnimatedScene(
      spec({ preset: "gradient-drift", intensity: 1 }),
      1920,
      1080,
      10
    )
    expect(gd.particles).toHaveLength(0)
    expect(gd.blobs.length).toBeGreaterThan(0)
  })

  it("starfield twinkle modulates particle alpha over time", () => {
    const t0 = computeAnimatedScene(
      spec({ preset: "starfield", intensity: 1 }),
      1920,
      1080,
      0
    )
    const t1 = computeAnimatedScene(
      spec({ preset: "starfield", intensity: 1 }),
      1920,
      1080,
      700
    )
    // Positions are ~static for twinkle; brightness changes.
    expect(t1.particles[0].x).toBeCloseTo(t0.particles[0].x)
    const anyAlphaChanged = t0.particles.some(
      (p, i) => Math.abs(p.alpha - t1.particles[i].alpha) > 1e-6
    )
    expect(anyAlphaChanged).toBe(true)
  })

  it("snow and embers both produce moving particles", () => {
    for (const preset of ["snow", "embers"] as const) {
      const a = computeAnimatedScene(
        spec({ preset, intensity: 1 }),
        1920,
        1080,
        0
      )
      const b = computeAnimatedScene(
        spec({ preset, intensity: 1 }),
        1920,
        1080,
        500
      )
      expect(a.particles.length).toBeGreaterThan(0)
      expect(a.particles[0].y).not.toBe(b.particles[0].y)
    }
  })
})

describe("drawAnimatedBackground", () => {
  it("paints base wash, glow, and particles without throwing", () => {
    const { ctx, calls } = recordingCtx()
    expect(() =>
      drawAnimatedBackground(ctx, spec(), 1920, 1080, 250)
    ).not.toThrow()
    expect(calls).toContain("fillRect") // base wash + glow blobs
    // Particles fall back to arc/fill in the DOM-less test environment.
    expect(calls).toContain("arc")
  })

  it("draws a base wash even at zero intensity (no particles)", () => {
    const { ctx, calls } = recordingCtx()
    drawAnimatedBackground(ctx, spec({ intensity: 0 }), 1920, 1080, 0)
    expect(calls).toContain("fillRect")
    expect(calls).not.toContain("arc")
  })
})
