/**
 * Reference design resolution, in pixels.
 *
 * All slide, theme, and lexicon-card geometry (font sizes, border radii, stroke
 * widths, scroll speeds, …) is authored against a nominal 1920×1080 canvas and
 * scaled by `actualCanvasWidth / DESIGN_WIDTH` when rendered at another output
 * resolution. Keeping the reference size in one place means the renderers,
 * the PDF exporter, the lexicon card, and the built-in themes cannot drift.
 */
export const DESIGN_WIDTH = 1920
export const DESIGN_HEIGHT = 1080

/**
 * Uniform scale factor for size quantities (font sizes, stroke widths, border
 * radii) when rendering the 1920×1080 design at an arbitrary surface.
 *
 * Uses the **smaller** of the two axis ratios so text and strokes stay
 * proportional and never over-grow on a wider-than-16:9 surface (where width
 * alone would inflate them past the available height). At exactly 1920×1080 this
 * is `1`, so it is byte-identical to the historical `canvasWidth / DESIGN_WIDTH`
 * scaling — the parity guarantee for the reflow work (screenim.md Phase 1).
 */
export function surfaceFontScale(
  canvasWidth: number,
  canvasHeight: number
): number {
  return Math.min(canvasWidth / DESIGN_WIDTH, canvasHeight / DESIGN_HEIGHT)
}
