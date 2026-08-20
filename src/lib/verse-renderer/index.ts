// Verse-renderer primitives, retained after the standalone verse render path was
// retired (themeredo.md, VR4). The layout + low-level draw passes are reused
// verbatim by the slide renderer's scripture-payload path
// (`slide-renderer/text-drawing.ts`) and by verse pagination
// (`lib/verse-pagination.ts`) — reproducing verse numbers / styled spans /
// reference formatting without reimplementing them in the slide path.
//
// `renderVerse` itself (the full verse-theme orchestrator: background + text box +
// decorative elements) is gone — scripture now renders through the slide renderer.

export { wrapText, wrapTextWithHardBreaks } from "./verse-tokens"
export {
  anchorPosition,
  computeVerseLayoutMetrics,
  measureVerseHeightAtFont,
} from "./layout"
export type { VerseLayoutRect, VerseLayoutMetrics } from "./layout"
export { drawReference, drawVerseText } from "./verse-text"
