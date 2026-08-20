import type { ElementAnimationState } from "@/lib/slide-animation"
import type {
  RenderOptions,
  VerseRenderData,
  VerseStyle,
} from "@/types/broadcast"

/** Shared media caches passed through the slide-rendering pipeline. */
export interface SlideRenderCaches {
  imageCache?: Map<string, HTMLImageElement>
  videoCache?: Map<string, HTMLVideoElement>
}

/**
 * Render-time payload for a scripture placeholder (themeredo.md, Phase 4 —
 * decision D2). At go-live the presenter hands the slide renderer the pushed
 * verse ({@link verse}) plus the verse typography to draw it with ({@link style}),
 * keyed by the scripture element's id (see {@link SlideRenderOptions.scriptureContent}).
 * The stored scripture element stays style-only — the live verse content and its
 * rich styling (verse numbers, styled spans, reference format) ride this payload
 * so `drawScriptureElement` can reproduce `renderVerse` byte-for-byte by reusing
 * the verse-renderer draw passes, instead of flattening the verse to a string.
 *
 * `style` is a {@link VerseStyle} — the verse-styling subset the verse layout + draw
 * passes actually read (narrowed from `BroadcastTheme` in flip VR1). Built from the
 * scripture placeholder via `scriptureElementToVerseStyle`, so the live scripture render
 * no longer depends on the full `BroadcastTheme`.
 */
export interface ScriptureRenderPayload {
  verse: VerseRenderData
  style: VerseStyle
  /**
   * Verse-render options that drive layout parity with `renderVerse` (themeredo.md,
   * Phase 4c): auto-fit thresholds (`verseAutoFit` / `maxVerseScale` /
   * `minVerseFontSize`), offsets, and opacity. `surface` is deliberately **not**
   * carried here — {@link import("./text-drawing").drawScriptureElement} derives it
   * from the draw canvas dimensions so one payload renders correctly at any output
   * resolution (surface font-scaling closes on the slide path this way). Omit for
   * the authored proportional size with no auto-fit.
   */
  options?: Omit<RenderOptions, "surface">
}

/** Per-frame rendering options (animation, text build-in, animation clock). */
export interface SlideRenderOptions {
  animationStates?: Map<string, ElementAnimationState>
  textBuildProgress?: Map<string, number>
  /**
   * Monotonic frame clock in milliseconds (e.g. `performance.now()`), consumed
   * by time-driven backgrounds. Surfaces that want animated backgrounds to move
   * must pass this on every RAF tick; omitting it renders a static frame at t=0.
   */
  frameTime?: number
  /**
   * Wall clock in milliseconds (e.g. `Date.now()`), consumed by time-driven
   * elements — currently clock-mode {@link import("@/types/slide").SlideTimerElement}
   * timers counting down to a time-of-day. Omitting it renders timers at their
   * static configured duration (the authoring/preview default). Inert for every
   * other element type.
   */
  now?: number
  /**
   * Draw only the slide background, skipping all foreground elements (text,
   * shapes, images). Used by the live-output "Clear" toggle to hide the text
   * while keeping the backdrop. Missing/false = draw everything (unchanged).
   */
  hideElements?: boolean
  /**
   * Live verse payloads for scripture placeholders, keyed by element id
   * (themeredo.md, Phase 4 — decision D2). When a scripture element's id is
   * present, {@link import("./text-drawing").drawScriptureElement} renders that
   * verse through the verse-renderer draw passes (verse numbers, styled spans,
   * reference format) instead of its stored flat `verseText`/`reference`. Absent
   * ids fall back to the flat, byte-identical legacy path. See
   * {@link ScriptureRenderPayload}.
   */
  scriptureContent?: Map<string, ScriptureRenderPayload>
}
