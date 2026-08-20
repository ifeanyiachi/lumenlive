import type { VerseStyle } from "@/types/broadcast"

/**
 * A realistic scripture {@link VerseStyle} for the verse-renderer layout/draw tests
 * and verse pagination. Mirrors the old "Classic Dark" built-in `BroadcastTheme`,
 * which was deleted when `BroadcastTheme` was retired — the draw passes only ever
 * read these six `VerseStyle` fields, so a standalone fixture is sufficient.
 */
export const CLASSIC_VERSE_STYLE: VerseStyle = {
  resolution: { width: 1920, height: 1080 },
  textBox: { enabled: false, color: "#000000", opacity: 0, borderRadius: 0, padding: 0 },
  verseText: {
    fontFamily: "Source Serif 4 Variable",
    fontSize: 72,
    fontWeight: 400,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "top",
    textTransform: "none",
    textDecoration: "none",
    lineHeight: 1.5,
    letterSpacing: 0,
    shadow: null,
    outline: null,
  },
  verseNumbers: { visible: true, fontSize: 20, color: "#d4a574", superscript: false },
  reference: {
    fontFamily: "Geist Variable",
    fontSize: 48,
    fontWeight: 500,
    color: "#d4a574",
    horizontalAlign: "center",
    verticalAlign: "top",
    textTransform: "none",
    textDecoration: "none",
    uppercase: true,
    letterSpacing: 2,
    lineHeight: 1.4,
    position: "above",
    shadow: null,
    outline: null,
  },
  layout: {
    anchor: "center",
    offsetX: 0,
    offsetY: 0,
    padding: { top: 60, right: 80, bottom: 60, left: 80 },
    textAlign: "center",
    backgroundWidth: 100,
    backgroundHeight: 100,
    textAreaWidth: 80,
    textAreaHeight: 80,
    referenceGap: 32,
  },
}
