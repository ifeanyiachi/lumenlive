import type { AnimatedBackground } from "@/types/slide"
import { surfaceFontScale } from "@/lib/canvas-constants"

/**
 * Procedural, time-driven slide backgrounds (pure Canvas2D — no WebGL).
 *
 * The whole effect is a **pure function of `(spec, width, height, timeMs)`**:
 * there is no per-instance mutable particle state. This matters because the same
 * live slide is rendered simultaneously on 3–5 canvases (editor preview, operator
 * monitor, broadcast output, thumbnails) plus NDI — a pure clock-driven scene
 * looks identical on all of them and is trivially testable.
 *
 * Layering (composed once per frame):
 *   1. base wash — a palette gradient fill (opaque, covers the frame)
 *   2. beams     — angled god-ray light shafts (godrays preset only)
 *   3. glow field — a few large soft radial blobs drifting on sine paths
 *   4. particles  — additive light motes (bokeh / embers / snow / stars)
 *
 * Presets differ only in their {@link PresetConfig} — count, size, motion model,
 * and blend — so the whole library is params over one engine.
 *
 * Perf (CLAUDE.md hot-path rules): the math ({@link computeAnimatedScene}) is
 * separated from the paint pass. Particle sprites are drawn from a small set of
 * **cached** offscreen stamps (one per colour, built once), never a
 * `createRadialGradient` per particle per frame. Only the base wash, the handful
 * of glow blobs, and beams allocate a gradient per frame, which is bounded.
 */

// ── Deterministic pseudo-random ──────────────────────────────────────────────
// Integer hash → [0,1). Stable across surfaces and runs; no Math.random (which
// would desync the canvases) and no per-frame state.
function rand(seed: number): number {
  let n = (seed | 0) ^ 0x9e3779b9
  n = Math.imul(n ^ (n >>> 16), 0x21f0aaad)
  n = Math.imul(n ^ (n >>> 15), 0x735a2d97)
  n = n ^ (n >>> 15)
  return (n >>> 0) / 4294967296
}

const TAU = Math.PI * 2

// ── Scene data (plain, testable) ─────────────────────────────────────────────

export interface SceneBlob {
  x: number
  y: number
  radius: number
  color: string
  alpha: number
}

export interface SceneParticle {
  x: number
  y: number
  radius: number
  color: string
  alpha: number
}

export interface SceneBeam {
  /** Top-edge anchor x. */
  x: number
  /** Tilt from vertical, radians. */
  angle: number
  /** Beam width in px. */
  width: number
  color: string
  alpha: number
}

export interface AnimatedScene {
  /** Palette gradient stops for the base wash (top→bottom). */
  baseStops: { offset: number; color: string }[]
  beams: SceneBeam[]
  blobs: SceneBlob[]
  particles: SceneParticle[]
}

type ParticleMotion = "float" | "rise" | "fall" | "twinkle" | "none"

interface PresetConfig {
  blobCount: number
  /** Blob radius as a fraction of the frame's larger dimension. */
  blobRadius: number
  blobAlpha: number
  /** Blob drift speed multiplier. */
  blobDrift: number
  /** Peak particle count at intensity = 1. */
  particleCount: number
  motion: ParticleMotion
  particleAlpha: number
  /** Base particle radius in design (1920-wide) pixels. */
  particleSize: number
  /** Extra radius (design px) scaled by a per-particle random. */
  particleSizeVar: number
  /** Horizontal sway amplitude as a fraction of width. */
  sway: number
  /** Alpha oscillation amount 0–1 (flicker / twinkle). */
  twinkle: number
  /** God-ray beam count (0 = none). */
  beams: number
}

const DEFAULT_PRESET: PresetConfig = {
  blobCount: 3,
  blobRadius: 0.6,
  blobAlpha: 0.5,
  blobDrift: 1,
  particleCount: 60,
  motion: "float",
  particleAlpha: 0.35,
  particleSize: 4,
  particleSizeVar: 4,
  sway: 0.03,
  twinkle: 0,
  beams: 0,
}

const PRESETS: Record<AnimatedBackground["preset"], PresetConfig> = {
  // Soft worship-pad: broad drifting colour fields + gentle rising motes.
  aurora: {
    blobCount: 3,
    blobRadius: 0.65,
    blobAlpha: 0.55,
    blobDrift: 1,
    particleCount: 50,
    motion: "float",
    particleAlpha: 0.3,
    particleSize: 3.5,
    particleSizeVar: 3.5,
    sway: 0.03,
    twinkle: 0.15,
    beams: 0,
  },
  // Out-of-focus camera bokeh: few large, soft, slowly floating discs.
  bokeh: {
    blobCount: 2,
    blobRadius: 0.5,
    blobAlpha: 0.28,
    blobDrift: 0.5,
    particleCount: 26,
    motion: "float",
    particleAlpha: 0.4,
    particleSize: 14,
    particleSizeVar: 22,
    sway: 0.02,
    twinkle: 0.2,
    beams: 0,
  },
  // Rising warm embers with a flicker.
  embers: {
    blobCount: 1,
    blobRadius: 0.45,
    blobAlpha: 0.22,
    blobDrift: 0.7,
    particleCount: 70,
    motion: "rise",
    particleAlpha: 0.55,
    particleSize: 2.5,
    particleSizeVar: 4,
    sway: 0.05,
    twinkle: 0.45,
    beams: 0,
  },
  // Dense twinkling star points, near-static.
  starfield: {
    blobCount: 1,
    blobRadius: 0.5,
    blobAlpha: 0.15,
    blobDrift: 0.3,
    particleCount: 140,
    motion: "twinkle",
    particleAlpha: 0.7,
    particleSize: 1.6,
    particleSizeVar: 2.2,
    sway: 0,
    twinkle: 0.85,
    beams: 0,
  },
  // Gentle falling snow with horizontal sway.
  snow: {
    blobCount: 0,
    blobRadius: 0.5,
    blobAlpha: 0.12,
    blobDrift: 0.4,
    particleCount: 90,
    motion: "fall",
    particleAlpha: 0.75,
    particleSize: 3.5,
    particleSizeVar: 4,
    sway: 0.04,
    twinkle: 0.1,
    beams: 0,
  },
  // Volumetric light shafts from above + faint floating dust.
  godrays: {
    blobCount: 1,
    blobRadius: 0.55,
    blobAlpha: 0.3,
    blobDrift: 0.4,
    particleCount: 24,
    motion: "float",
    particleAlpha: 0.3,
    particleSize: 3,
    particleSizeVar: 5,
    sway: 0.02,
    twinkle: 0.3,
    beams: 5,
  },
  // Slowly morphing gradient — big overlapping colour fields, no particles.
  "gradient-drift": {
    blobCount: 3,
    blobRadius: 0.85,
    blobAlpha: 0.6,
    blobDrift: 0.6,
    particleCount: 0,
    motion: "none",
    particleAlpha: 0,
    particleSize: 0,
    particleSizeVar: 0,
    sway: 0,
    twinkle: 0,
    beams: 0,
  },
}

function configFor(preset: AnimatedBackground["preset"]): PresetConfig {
  return PRESETS[preset] ?? DEFAULT_PRESET
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

/**
 * Computes the full animated scene as plain data — pure, deterministic, and
 * canvas-free. The paint pass ({@link drawAnimatedBackground}) consumes this.
 */
export function computeAnimatedScene(
  spec: AnimatedBackground,
  width: number,
  height: number,
  timeMs: number
): AnimatedScene {
  const cfg = configFor(spec.preset)
  const palette =
    spec.palette.length > 0 ? spec.palette : ["#1e293b", "#0f172a"]
  const intensity = clamp01(spec.intensity)
  const speed = spec.speed > 0 ? spec.speed : 1
  const t = (timeMs / 1000) * speed
  const scale = surfaceFontScale(width, height)
  const maxDim = Math.max(width, height)

  // Base wash: palette top→bottom.
  const baseStops =
    palette.length === 1
      ? [
          { offset: 0, color: palette[0] },
          { offset: 1, color: palette[0] },
        ]
      : palette.map((color, i) => ({
          offset: i / (palette.length - 1),
          color,
        }))

  // Beams (god rays): tilted shafts drifting slowly across the top.
  const beams: SceneBeam[] = []
  for (let i = 0; i < cfg.beams; i++) {
    const p = rand(i * 9 + 101)
    const drift = Math.sin(t * 0.05 + p * TAU) * width * 0.08
    beams.push({
      x: width * ((i + 0.5) / cfg.beams) + drift,
      angle: -0.25 + (p - 0.5) * 0.3,
      width: width * (0.04 + p * 0.05),
      color: palette[i % palette.length],
      alpha:
        (0.12 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.2 + p * TAU))) * intensity,
    })
  }

  // Glow blobs: each drifts on an independent Lissajous path.
  const blobs: SceneBlob[] = []
  for (let i = 0; i < cfg.blobCount; i++) {
    const px = rand(i * 3 + 1)
    const py = rand(i * 3 + 2)
    const pr = rand(i * 3 + 3)
    const d = cfg.blobDrift
    const x =
      width * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.11 * d + px * TAU)))
    const y =
      height * (0.2 + 0.6 * (0.5 + 0.5 * Math.cos(t * 0.09 * d + py * TAU)))
    const radius =
      maxDim * cfg.blobRadius * (0.8 + 0.2 * Math.sin(t * 0.07 * d + pr * TAU))
    blobs.push({
      x,
      y,
      radius,
      color: palette[i % palette.length],
      alpha: cfg.blobAlpha * intensity,
    })
  }

  // Particles: motion model per preset.
  const count = Math.round(cfg.particleCount * intensity)
  const particles: SceneParticle[] = []
  if (cfg.motion !== "none") {
    const wrapH = height * 1.15
    for (let i = 0; i < count; i++) {
      const s1 = rand(i * 5 + 11)
      const s2 = rand(i * 5 + 12)
      const s3 = rand(i * 5 + 13)
      const s4 = rand(i * 5 + 14)

      let x: number
      let y: number
      let alpha = cfg.particleAlpha * (0.4 + s2 * 0.6)

      if (cfg.motion === "twinkle") {
        // Near-static points whose brightness oscillates.
        x = s1 * width
        y = s2 * height
        const osc = 0.5 + 0.5 * Math.sin(t * (1 + s3 * 2) + s4 * TAU)
        alpha *= 1 - cfg.twinkle + cfg.twinkle * osc
      } else {
        const dirUp = cfg.motion === "rise" || cfg.motion === "float"
        const rate =
          (cfg.motion === "rise" ? 0.06 : cfg.motion === "fall" ? 0.05 : 0.02) *
          (0.6 + s2)
        const travel = (t * rate + s3) * height
        const prog = travel % wrapH
        y = dirUp ? height - prog : prog - height * 0.15
        x =
          s1 * width +
          Math.sin(t * 0.2 * (0.5 + s4) + s1 * TAU) * width * cfg.sway
        if (cfg.twinkle > 0) {
          const osc = 0.5 + 0.5 * Math.sin(t * (2 + s4 * 3) + s3 * TAU)
          alpha *= 1 - cfg.twinkle + cfg.twinkle * osc
        }
      }

      const radius =
        (cfg.particleSize + s3 * cfg.particleSizeVar) * Math.max(scale, 0.15)
      particles.push({
        x,
        y,
        radius,
        color: palette[i % palette.length],
        alpha: alpha * intensity,
      })
    }
  }

  return { baseStops, beams, blobs, particles }
}

// ── Paint pass ───────────────────────────────────────────────────────────────
// Cached radial sprite stamps, one per colour (built once, reused every frame).
const stampCache = new Map<string, HTMLCanvasElement>()
const STAMP_SIZE = 64

function getColoredStamp(color: string): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null
  const cached = stampCache.get(color)
  if (cached) return cached
  const canvas = document.createElement("canvas")
  canvas.width = STAMP_SIZE
  canvas.height = STAMP_SIZE
  const sctx = canvas.getContext("2d")
  if (!sctx) return null
  const g = sctx.createRadialGradient(
    STAMP_SIZE / 2,
    STAMP_SIZE / 2,
    0,
    STAMP_SIZE / 2,
    STAMP_SIZE / 2,
    STAMP_SIZE / 2
  )
  g.addColorStop(0, color)
  g.addColorStop(1, "transparent")
  sctx.fillStyle = g
  sctx.fillRect(0, 0, STAMP_SIZE, STAMP_SIZE)
  if (stampCache.size >= 32) stampCache.clear()
  stampCache.set(color, canvas)
  return canvas
}

/**
 * Paints an animated background onto `ctx`. Called first in the slide draw pass,
 * so the frame is fresh; the base wash is opaque and covers everything.
 */
export function drawAnimatedBackground(
  ctx: CanvasRenderingContext2D,
  spec: AnimatedBackground,
  width: number,
  height: number,
  timeMs: number
): void {
  const scene = computeAnimatedScene(spec, width, height, timeMs)

  // 1. Base wash (opaque).
  if (spec.baseColor) {
    ctx.fillStyle = spec.baseColor
    ctx.fillRect(0, 0, width, height)
  }
  const wash = ctx.createLinearGradient(0, 0, 0, height)
  for (const stop of scene.baseStops) wash.addColorStop(stop.offset, stop.color)
  ctx.save()
  if (spec.baseColor) ctx.globalAlpha = 0.85
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, width, height)
  ctx.restore()

  // 2. Beams (additive god-ray shafts).
  if (scene.beams.length > 0) {
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    const beamLen = Math.hypot(width, height) * 1.4
    for (const beam of scene.beams) {
      ctx.save()
      ctx.translate(beam.x, 0)
      ctx.rotate(beam.angle)
      const g = ctx.createLinearGradient(0, 0, 0, beamLen)
      g.addColorStop(0, beam.color)
      g.addColorStop(1, "transparent")
      ctx.globalAlpha = beam.alpha
      ctx.fillStyle = g
      ctx.fillRect(-beam.width / 2, 0, beam.width, beamLen)
      ctx.restore()
    }
    ctx.restore()
  }

  // 3. Glow field (additive soft blobs).
  if (scene.blobs.length > 0) {
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    for (const blob of scene.blobs) {
      const g = ctx.createRadialGradient(
        blob.x,
        blob.y,
        0,
        blob.x,
        blob.y,
        blob.radius
      )
      g.addColorStop(0, blob.color)
      g.addColorStop(1, "transparent")
      ctx.globalAlpha = blob.alpha
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
    }
    ctx.restore()
  }

  // 4. Particles (additive motes from cached stamps).
  if (scene.particles.length > 0) {
    ctx.save()
    ctx.globalCompositeOperation = "lighter"
    for (const p of scene.particles) {
      const stamp = getColoredStamp(p.color)
      ctx.globalAlpha = p.alpha
      const d = p.radius * 2
      if (stamp) {
        ctx.drawImage(stamp, p.x - p.radius, p.y - p.radius, d, d)
      } else {
        // Fallback (no DOM, e.g. tests): a plain filled dot.
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.radius, 0, TAU)
        ctx.fill()
      }
    }
    ctx.restore()
  }
}
