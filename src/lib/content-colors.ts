/**
 * Content colours: defaults for what users put on screen (slides, alerts,
 * props, countdowns, text effects) and the colour-picker's colour-space
 * gradients. These are CONTENT, not app UI — the UI uses design tokens
 * (src/design). This module is allowlisted by design-lint; keep every
 * content default here so it has one name and one value.
 */
export const CONTENT_COLORS = {
  /** Output black: empty frames, letterboxing, default backgrounds and outlines. */
  black: "#000000",
  /** Default text colour on dark output. */
  white: "#ffffff",
  /** Translucent black for text shadows, prop and countdown backgrounds. */
  black40: "rgba(0,0,0,0.4)",
  black50: "rgba(0,0,0,0.5)",
  black70: "rgba(0,0,0,0.7)",
  /** Default solid slide background. */
  slideNight: "#1a1a2e",
  /** Default two-stop slide gradient. */
  gradientFrom: "#0f0c29",
  gradientTo: "#302b63",
  /** Colour of a newly added gradient stop. */
  gradientStop: "#888888",
  /** Default verse highlight. */
  highlight: "#facc15",
  /** Default alert backgrounds. */
  alertRed: "#dc2626",
  alertBlue: "#2563eb",
  /** Light card ground (lexicon cards, light announcement slides). */
  paper: "#f8fafc",
  /** Colour-picker saturation/value overlay. */
  svOverlay:
    "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)",
  /** Colour-picker hue track. */
  hueSpectrum:
    "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
} as const
