import type { Presentation, SlideElement } from "@/types/slide"

// ── PPTX font reconciliation ─────────────────────────────────────────────────
//
// A .pptx records the font family a text box was authored with (e.g. "Calibri").
// If that family isn't installed on the operator's machine, the slide renderer
// falls back to a generic sans-serif, which changes the glyph metrics, weight,
// and line wrapping — the text reads as "distorted" even though its position and
// colour imported correctly. This module lets the import flow detect those
// unmatched families up front and remap them to a font that *will* render, plus
// an optional size scale, while leaving every other style untouched.
//
// Everything here is pure (plain data in, plain data out) so it stays testable
// and never reaches for the DOM font APIs — the caller supplies the list of
// available families.

/** A user-chosen replacement for one unmatched font family. */
export interface FontSubstitution {
  /** Replacement font family to apply to affected elements. */
  family: string
  /** Multiplier applied to each affected element's fontSize (1 = unchanged). */
  scale: number
}

/**
 * Web fonts bundled with the app (see `index.css`). These always render, so we
 * treat them as available even when the OS font-enumeration API omits them.
 */
export const BUNDLED_FONTS = ["Inter", "Geist", "Geist Mono", "Source Serif 4"]

/** Case/space-insensitive key for comparing font-family names. */
export function normalizeFamily(family: string): string {
  return family.trim().toLowerCase()
}

/** The font family an element renders with, or null if it carries none. */
function fontOf(el: SlideElement): string | null {
  if (el.type === "text" || el.type === "scripture") return el.fontFamily
  return null
}

/**
 * Every distinct fontFamily referenced by the presentation's text/scripture
 * elements, in first-seen order and preserving the original casing.
 */
export function collectFontFamilies(pres: Presentation): string[] {
  const seen = new Map<string, string>()
  for (const slide of pres.slides) {
    for (const el of slide.elements) {
      const family = fontOf(el)
      if (!family || !family.trim()) continue
      const key = normalizeFamily(family)
      if (!seen.has(key)) seen.set(key, family)
    }
  }
  return Array.from(seen.values())
}

/**
 * Referenced families that no available family matches (case-insensitive).
 * `available` should already include {@link BUNDLED_FONTS}.
 */
export function findUnmatchedFonts(
  referenced: string[],
  available: string[]
): string[] {
  const have = new Set(available.map(normalizeFamily))
  return referenced.filter((f) => f.trim() && !have.has(normalizeFamily(f)))
}

/** Count text/scripture elements using a given family (case-insensitive). */
export function countElementsUsingFont(
  pres: Presentation,
  family: string
): number {
  const key = normalizeFamily(family)
  let count = 0
  for (const slide of pres.slides) {
    for (const el of slide.elements) {
      const f = fontOf(el)
      if (f && normalizeFamily(f) === key) count++
    }
  }
  return count
}

// Close equivalents for the common Office fonts, so the dialog can pre-select a
// sensible default instead of dumping the user on an arbitrary first entry.
const SUGGESTIONS: Record<string, string> = {
  calibri: "Inter",
  "calibri light": "Inter",
  "segoe ui": "Inter",
  arial: "Inter",
  helvetica: "Inter",
  verdana: "Inter",
  tahoma: "Inter",
  "trebuchet ms": "Inter",
  cambria: "Source Serif 4",
  "times new roman": "Source Serif 4",
  georgia: "Source Serif 4",
  garamond: "Source Serif 4",
  consolas: "Geist Mono",
  "courier new": "Geist Mono",
}

/**
 * Suggest a replacement family for an unmatched font: a curated close match if
 * we know one and it's available, otherwise a bundled sans, otherwise whatever
 * the caller has. Used only to seed the dialog's default selection.
 */
export function suggestReplacement(
  family: string,
  available: string[]
): string {
  const has = (name: string) =>
    available.some((a) => normalizeFamily(a) === normalizeFamily(name))
  const target = SUGGESTIONS[normalizeFamily(family)]
  if (target && has(target)) return target
  if (has("Inter")) return "Inter"
  return available[0] ?? "Inter"
}

/**
 * Return a copy of `pres` with each unmatched family remapped per `subs` —
 * replacing `fontFamily` and scaling `fontSize`, leaving position, colour,
 * weight, alignment, and every other style byte-identical. `subs` is keyed by
 * {@link normalizeFamily}. Elements whose family isn't in `subs` are returned
 * unchanged (referential equality preserved).
 */
export function applyFontSubstitutions(
  pres: Presentation,
  subs: Map<string, FontSubstitution>
): Presentation {
  if (subs.size === 0) return pres
  return {
    ...pres,
    slides: pres.slides.map((slide) => ({
      ...slide,
      elements: slide.elements.map((el) => {
        const family = fontOf(el)
        if (!family) return el
        const sub = subs.get(normalizeFamily(family))
        if (!sub) return el
        // Only text and scripture reach here (fontOf gated them), and both
        // carry fontFamily + fontSize.
        const sized = el as SlideElement & { fontSize: number }
        return {
          ...sized,
          fontFamily: sub.family,
          fontSize: Math.round(sized.fontSize * sub.scale),
        }
      }),
    })),
  }
}
