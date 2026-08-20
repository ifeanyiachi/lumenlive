/**
 * Recording 2D context for the Phase-4 parity harness (themeredo.md).
 *
 * The verse → slide switch must be proven output-preserving, but the test
 * environment has no real canvas. This context is complete enough to drive both
 * `renderVerse` and `drawScriptureElement` without throwing, while recording
 * every text draw with the graphics state in effect at the moment it happened —
 * so the harness can compare *what text landed where, at what size* between the
 * two renderers.
 *
 * `measureText` is length-proportional (the same deterministic model the
 * existing verse/slide layout tests use), so wrapping is stable and comparable.
 */

/** One recorded `fillText`/`strokeText`, with the graphics state at draw time. */
export interface TextDraw {
  kind: "fill" | "stroke"
  text: string
  x: number
  y: number
  /** The `ctx.font` string in effect (e.g. `"italic 600 44px Inter"`). */
  font: string
  fillStyle: string
  strokeStyle: string
  textAlign: string
  textBaseline: string
}

export interface RecordingCtx {
  ctx: CanvasRenderingContext2D
  draws: TextDraw[]
}

const CHAR_WIDTH = 10

/** Pull the pixel size out of a CSS font string (`"600 44px Inter"` → 44). */
export function fontPx(font: string): number | null {
  const m = /(\d+(?:\.\d+)?)px/.exec(font)
  return m ? Number(m[1]) : null
}

/**
 * Build a recording context. Assignable state props (`font`, `fillStyle`,
 * `textAlign`, …) are tracked; geometry/path calls are inert; gradient factories
 * return a stub. Every `fillText`/`strokeText` is pushed to `draws`.
 */
export function recordingCtx(): RecordingCtx {
  const draws: TextDraw[] = []
  const state: Record<string, unknown> = {
    font: "10px sans-serif",
    fillStyle: "#000000",
    strokeStyle: "#000000",
    textAlign: "start",
    textBaseline: "alphabetic",
    letterSpacing: "0px",
    globalAlpha: 1,
    lineWidth: 1,
    filter: "none",
    shadowColor: "transparent",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    lineJoin: "miter",
  }
  const gradient = { addColorStop() {} }

  const record = (kind: "fill" | "stroke", args: unknown[]) => {
    draws.push({
      kind,
      text: String(args[0] ?? ""),
      x: Number(args[1] ?? 0),
      y: Number(args[2] ?? 0),
      font: String(state.font),
      fillStyle: String(state.fillStyle),
      strokeStyle: String(state.strokeStyle),
      textAlign: String(state.textAlign),
      textBaseline: String(state.textBaseline),
    })
  }

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop in state) return state[prop]
      if (prop === "measureText")
        return (t: string) => ({ width: String(t).length * CHAR_WIDTH })
      if (prop === "createLinearGradient" || prop === "createRadialGradient")
        return () => gradient
      if (prop === "fillText") return (...a: unknown[]) => record("fill", a)
      if (prop === "strokeText") return (...a: unknown[]) => record("stroke", a)
      if (prop === "canvas") return { width: 1920, height: 1080 }
      // Everything else (save/restore/beginPath/clip/fillRect/…) is inert.
      return () => {}
    },
    set(_t, prop: string, value: unknown) {
      state[prop] = value
      return true
    },
  }

  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  return { ctx, draws }
}
