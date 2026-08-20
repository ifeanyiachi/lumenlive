import type { VerseStyle } from "@/types/broadcast"
import type { TextStyle } from "@/types/canvas"
import type { SlideScriptureElement } from "@/types/slide"

/**
 * Reconstruct the verse-render `style` for a scripture placeholder (themeredo.md, RF1).
 *
 * The live scripture render still lays the verse body out through the verse-renderer
 * draw passes (`computeVerseLayoutMetrics` / `drawVerseText` / `drawReference`), which
 * consume a {@link VerseStyle} — the verse-styling subset those passes read, and the
 * `style` carried by `ScriptureRenderPayload` (narrowed off `BroadcastTheme` in flip VR1).
 * Until F5/RF2 that style *was* the pushed `BroadcastTheme`; the renderer Theme-object flip
 * removed it from the live path, so the style is rebuilt from the new `Theme`'s scripture
 * placeholder element. This is that rebuild.
 *
 * The element carries the full verse styling (RF1 enrichment — verse numbers, reference
 * format, per-verse breaks, textBox, body transform/tracking); its **box** (`x/y/width/
 * height`, percent of frame) becomes the verse text area. Geometry is expressed at a
 * 1920×1080 reference resolution via a top-left anchor + offset, so at a 16:9 surface the
 * verse text area is exactly the element box, and the verse renderer's own surface
 * projection reflows it proportionally at other resolutions.
 *
 * This is *not* pixel-parity with the original theme (the placeholder is leaner — e.g. it
 * does not carry a separate reference font family, which reuses the body's): it is
 * **feature-preserving**, matching the reframed correctness bar for the object flip. Verse
 * numbers, reference position/uppercase, per-verse breaks, auto-fit, and paging all render.
 *
 * PURE: builds a fresh VerseStyle; the input element is never mutated.
 */

const REFERENCE_RESOLUTION = { width: 1920, height: 1080 } as const

/** The verse-render style for a scripture placeholder element. */
export function scriptureElementToVerseStyle(
  el: SlideScriptureElement
): VerseStyle {
  const fontStyle: TextStyle["fontStyle"] = el.italic ? "italic" : "normal"
  const shadow = el.shadow
    ? { color: el.shadow.color, blur: el.shadow.blur, x: el.shadow.offsetX, y: el.shadow.offsetY }
    : null

  const verseText: TextStyle = {
    fontFamily: el.fontFamily,
    fontSize: el.fontSize,
    fontWeight: el.fontWeight,
    fontStyle,
    color: el.color,
    horizontalAlign: el.horizontalAlign,
    verticalAlign: el.verticalAlign,
    textTransform: el.textTransform ?? "none",
    lineHeight: el.lineHeight,
    letterSpacing: el.letterSpacing ?? 0,
    shadow,
    outline: null,
  }

  // Reference reuses the body's font family/weight (the placeholder does not carry a
  // separate reference face — the migrator never captured one either), with its own
  // size/color plus the format flags.
  const reference: VerseStyle["reference"] = {
    fontFamily: el.fontFamily,
    fontSize: el.referenceFontSize,
    fontWeight: el.fontWeight,
    fontStyle,
    color: el.referenceColor,
    horizontalAlign: el.horizontalAlign,
    verticalAlign: el.verticalAlign,
    textTransform: "none",
    lineHeight: 1.4,
    letterSpacing: 0,
    shadow: null,
    outline: null,
    uppercase: el.referenceUppercase ?? false,
    position: el.referencePosition ?? "below",
  }

  return {
    resolution: { ...REFERENCE_RESOLUTION },
    textBox: el.textBox ?? {
      enabled: false,
      color: "#000000",
      opacity: 0,
      borderRadius: 0,
      padding: 0,
    },
    verseText,
    verseNumbers: el.verseNumbers ?? {
      visible: false,
      fontSize: el.fontSize * 0.6,
      color: el.color,
      superscript: true,
    },
    reference,
    // The element's percent box becomes the verse text area: a top-left anchor + offset
    // at the reference resolution places the area at the box, with background = whole
    // frame so `textAreaWidth/Height` (percent of background) equal the box percentages.
    layout: {
      anchor: "top-left",
      offsetX: (el.x / 100) * REFERENCE_RESOLUTION.width,
      offsetY: (el.y / 100) * REFERENCE_RESOLUTION.height,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      textAlign: el.horizontalAlign,
      backgroundWidth: 100,
      backgroundHeight: 100,
      textAreaWidth: el.width,
      textAreaHeight: el.height,
      breakPerVerse: el.breakPerVerse ?? false,
    },
  }
}
