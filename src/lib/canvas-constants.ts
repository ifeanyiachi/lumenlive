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
