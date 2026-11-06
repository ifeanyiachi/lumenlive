import { firstChild, firstDesc } from "./xml"

// ── Color resolution ─────────────────────────────────────────────────────────

/** Theme color scheme (dk1/lt1/accent1…) resolved to hex, keyed by scheme name. */
export type ThemeColors = Map<string, string>

function clamp8(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)))
}

function toHex(n: number): string {
  return clamp8(n).toString(16).padStart(2, "0")
}

/** Apply OOXML lumMod/lumOff luminance modifiers to a hex color. */
function applyLumMods(
  hex: string,
  lumMod: number | null,
  lumOff: number | null
): string {
  if (lumMod === null && lumOff === null) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mod = lumMod ?? 1
  const off = lumOff ?? 0
  const adj = (c: number) => clamp8(c * mod + 255 * off)
  return `#${toHex(adj(r))}${toHex(adj(g))}${toHex(adj(b))}`
}

/**
 * Resolve a color container (`<a:solidFill>`, `<a:rPr>`, etc.) to a hex string.
 * Handles srgbClr, schemeClr (via theme + master color map), sysClr, and the
 * common lumMod/lumOff tint modifiers. Returns null if no color is present.
 */
export function resolveColor(
  container: Element | null,
  theme: ThemeColors,
  clrMap: Map<string, string>
): string | null {
  if (!container) return null

  const srgb = firstDesc(container, "a:srgbClr")
  if (srgb) {
    const val = srgb.getAttribute("val")
    if (val)
      return applyLumMods(
        `#${val}`,
        readLum(srgb, "a:lumMod"),
        readLum(srgb, "a:lumOff")
      )
  }

  const scheme = firstDesc(container, "a:schemeClr")
  if (scheme) {
    let name = scheme.getAttribute("val") ?? ""
    // The master's clrMap remaps slide-facing names (bg1/tx1/…) to theme slots.
    name = clrMap.get(name) ?? name
    const hex = theme.get(name)
    if (hex)
      return applyLumMods(
        hex,
        readLum(scheme, "a:lumMod"),
        readLum(scheme, "a:lumOff")
      )
  }

  const sys = firstDesc(container, "a:sysClr")
  if (sys) {
    const last = sys.getAttribute("lastClr")
    if (last) return `#${last}`
  }

  return null
}

/**
 * Resolve a bare scheme-colour *name* (e.g. `tx1`, `bg1`, `accent1`) to hex via
 * the master's colour map then the theme. Used for values that aren't wrapped in
 * a colour container — chiefly the implicit `tx1` default a placeholder's text
 * takes when nothing sets an explicit colour.
 */
export function resolveScheme(
  name: string,
  theme: ThemeColors,
  clrMap: Map<string, string>
): string | null {
  const mapped = clrMap.get(name) ?? name
  return theme.get(mapped) ?? null
}

function readLum(el: Element, tag: string): number | null {
  const node = firstDesc(el, tag)
  if (!node) return null
  const val = Number(node.getAttribute("val"))
  return Number.isFinite(val) ? val / 100000 : null
}

/** Parse `ppt/theme/themeN.xml` into a name→hex color map. */
export function parseThemeColors(doc: Document | null): ThemeColors {
  const colors: ThemeColors = new Map()
  if (!doc) return colors
  const scheme = doc.getElementsByTagName("a:clrScheme").item(0)
  if (!scheme) return colors
  for (const child of Array.from(scheme.children)) {
    // e.g. <a:dk1><a:sysClr lastClr="000000"/></a:dk1>
    const name = child.tagName.replace(/^a:/, "")
    const srgb = firstChild(child, "a:srgbClr")
    const sys = firstChild(child, "a:sysClr")
    if (srgb?.getAttribute("val")) {
      colors.set(name, `#${srgb.getAttribute("val")}`)
    } else if (sys?.getAttribute("lastClr")) {
      colors.set(name, `#${sys.getAttribute("lastClr")}`)
    }
  }
  return colors
}

/** Read the master's <p:clrMap> (bg1→lt1, tx1→dk1, …). */
export function parseClrMap(masterDoc: Document | null): Map<string, string> {
  const map = new Map<string, string>()
  if (!masterDoc) return map
  const clrMap = masterDoc.getElementsByTagName("p:clrMap").item(0)
  if (!clrMap) return map
  for (const attr of Array.from(clrMap.attributes)) {
    map.set(attr.name, attr.value)
  }
  return map
}
