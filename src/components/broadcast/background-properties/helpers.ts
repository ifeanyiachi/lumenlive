import type {
  AnimatedBackground,
  AnimatedBackgroundPreset,
} from "@/types/canvas"

/** Human labels for the procedural background presets, in menu order. */
export const PRESET_LABELS: Record<AnimatedBackgroundPreset, string> = {
  aurora: "Aurora",
  bokeh: "Bokeh",
  embers: "Embers",
  starfield: "Starfield",
  snow: "Snow",
  godrays: "God rays",
  "gradient-drift": "Gradient drift",
}

/** The default spec seeded when a theme first switches to an animated background. */
export const DEFAULT_ANIMATED_BACKGROUND: AnimatedBackground = {
  preset: "aurora",
  palette: ["#4c1d95", "#1e3a8a", "#0ea5e9"],
  speed: 1,
  intensity: 0.6,
  baseColor: "#0b1020",
}

export function parseColorOpacity(color: string): {
  hex: string
  opacity: number
} {
  if (color.length === 9 && color.startsWith("#")) {
    const alphaHex = color.slice(7, 9)
    const alpha = parseInt(alphaHex, 16) / 255
    return { hex: color.slice(0, 7), opacity: Math.round(alpha * 100) }
  }
  if (color.length === 7 && color.startsWith("#")) {
    return { hex: color, opacity: 100 }
  }
  return { hex: color || "#000000", opacity: 100 }
}

export function buildColorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 100) return hex
  const alphaHex = Math.round((opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}
