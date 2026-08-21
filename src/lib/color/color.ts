/**
 * Pure color conversion + parsing helpers for the shared color picker.
 *
 * The app stores colors as `#rrggbb` hex strings almost everywhere; a few
 * surfaces also carry `rgba(...)` values that the picker cannot represent
 * (alpha is handled separately by those callers). These helpers deliberately
 * only model opaque RGB in hex/rgb/hsv space — the picker leads with the hex
 * field, and RGB is offered as a secondary view over the same value.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsv {
  /** hue in degrees, 0..360 */
  h: number
  /** saturation, 0..100 */
  s: number
  /** value/brightness, 0..100 */
  v: number
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

/**
 * Normalize arbitrary hex input to canonical lowercase `#rrggbb`, or `null`
 * when the string is not a hex color. Accepts an optional leading `#`, and
 * expands 3-digit shorthand (`#abc` → `#aabbcc`).
 */
export function normalizeHex(input: string): string | null {
  if (typeof input !== "string") return null
  let hex = input.trim().toLowerCase()
  if (hex.startsWith("#")) hex = hex.slice(1)
  if (/^[0-9a-f]{3}$/.test(hex)) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("")
  }
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`
  return null
}

/** True when the string parses as a hex color. */
export function isHex(input: string): boolean {
  return normalizeHex(input) !== null
}

/** Parse a hex color to RGB. Returns black for anything unparseable. */
export function hexToRgb(hex: string): Rgb {
  const normal = normalizeHex(hex) ?? "#000000"
  return {
    r: parseInt(normal.slice(1, 3), 16),
    g: parseInt(normal.slice(3, 5), 16),
    b: parseInt(normal.slice(5, 7), 16),
  }
}

const channelToHex = (n: number) =>
  clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")

/** Serialize RGB (channels clamped/rounded to 0..255) to `#rrggbb`. */
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`
}

/** Convert RGB (0..255) to HSV (h: 0..360, s/v: 0..100). */
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h *= 60
    if (h < 0) h += 360
  }

  const s = max === 0 ? 0 : delta / max
  return { h, s: s * 100, v: max * 100 }
}

/** Convert HSV (h: 0..360, s/v: 0..100) to RGB (0..255). */
export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hn = ((h % 360) + 360) % 360
  const sn = clamp(s, 0, 100) / 100
  const vn = clamp(v, 0, 100) / 100

  const c = vn * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = vn - c

  let r = 0
  let g = 0
  let b = 0
  if (hn < 60) [r, g, b] = [c, x, 0]
  else if (hn < 120) [r, g, b] = [x, c, 0]
  else if (hn < 180) [r, g, b] = [0, c, x]
  else if (hn < 240) [r, g, b] = [0, x, c]
  else if (hn < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

export function hexToHsv(hex: string): Hsv {
  return rgbToHsv(hexToRgb(hex))
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv))
}
