// Scripture parity harness (themeredo.md, Phase 4) — the instrument the
// verse → slide flip is gated on. Drives `renderVerse` and `renderSlide` through
// one recording context and reports where their scripture text output diverges.

export { recordingCtx, fontPx, type TextDraw, type RecordingCtx } from "./recording-ctx"
export {
  diffScriptureParity,
  verseFacts,
  slideScriptureFacts,
  flattenVerse,
  scriptureElementFromTheme,
  type RenderFacts,
  type ScriptureParityReport,
} from "./scripture-parity"
export {
  diffCountdownParity,
  countdownVerseFacts,
  countdownSlideFacts,
  countdownSlideFromTheme,
  type CountdownFacts,
  type CountdownParityReport,
  type CountdownPoint,
} from "./countdown-parity"
