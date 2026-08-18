import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import { renderVerse, type VerseLayoutMetrics } from "@/lib/verse-renderer"

/**
 * Render a countdown using a broadcast **theme** — the shared path for both the
 * Theme Designer's live preview and the broadcast output window, so the two can
 * never drift.
 *
 * A countdown theme is a normal {@link BroadcastTheme}: it reuses the theme's
 * background, decorative elements, backing box and layout exactly as a verse
 * theme would. Because a theme's category is exclusive, a `countdown`-category
 * theme's `verseText` *is* the timer-digit style — so the ordinary text controls
 * in the designer style the timer with no extra plumbing. We express the render
 * by delegating to {@link renderVerse} with a derived theme:
 *
 *   - `verseText` styles the digits (its colour overridden by the caller-resolved
 *     `timeColor`, so urgency warn/danger recolouring still works),
 *   - the timer label takes the `reference` slot (collapsed to zero height when
 *     the label is hidden, so the digits stay vertically centred),
 *   - verse numbers are forced off.
 *
 * Pure module: no React / Zustand / Tauri. Time math stays in
 * `@/lib/countdown/timer`; this module only paints what it is handed.
 */
export interface CountdownThemeFrame {
  /** Preformatted time string, e.g. "04:59" (from `formatCountdownTime`). */
  timeText: string
  /** Optional label shown above/below the digits (the timer's own label). */
  label?: string
  /** Whether to show the label at all. */
  showLabel?: boolean
  /**
   * Colour for the digits, already urgency-resolved by the caller (via
   * `resolveTimeColor` with the theme's base colour). Keeps warn/danger logic in
   * one place rather than duplicating thresholds here.
   */
  timeColor: string
  /** Frame opacity — the caller passes the flash pulse on expiry (0..1). */
  opacity?: number
  /** Optional image cache for image/video backgrounds and image elements. */
  imageCache?: Map<string, HTMLImageElement>
  /**
   * Real output surface (px) to project the theme onto. Without it the theme
   * renders at its authored resolution anchored top-left — correct only when the
   * canvas already matches that resolution (the designer). The live output MUST
   * pass its surface so a themed countdown fills the projector instead of pinning
   * to the corner at authoring size.
   */
  surface?: { width: number; height: number }
  /** Monotonic frame clock (e.g. `performance.now()`) for animated backgrounds. */
  frameTime?: number
}

/** Build the derived verse-theme that renders a countdown for `frame`. */
export function deriveCountdownVerseTheme(
  theme: BroadcastTheme,
  frame: CountdownThemeFrame
): BroadcastTheme {
  const showLabel = Boolean(frame.showLabel && frame.label)
  return {
    ...theme,
    verseText: { ...theme.verseText, color: frame.timeColor },
    verseNumbers: { ...theme.verseNumbers, visible: false },
    // Collapse the label region to zero height when hidden so the digits stay
    // centred (the layout pass always reserves `reference.fontSize` otherwise).
    reference: showLabel
      ? theme.reference
      : { ...theme.reference, fontSize: 0 },
    layout: showLabel ? theme.layout : { ...theme.layout, referenceGap: 0 },
  }
}

/**
 * Paint the countdown for `frame` onto `ctx`. Returns the verse-layout metrics
 * (the timer occupies the verse region) so the designer can drive its drag/resize
 * overlay off the same measurement pass; the live output ignores the return.
 */
export function renderCountdownTheme(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  frame: CountdownThemeFrame
): VerseLayoutMetrics | null {
  const derived = deriveCountdownVerseTheme(theme, frame)
  const verse: VerseRenderData = {
    reference: frame.showLabel && frame.label ? frame.label : "",
    segments: [{ text: frame.timeText }],
  }
  return renderVerse(ctx, derived, verse, {
    opacity: frame.opacity,
    imageCache: frame.imageCache,
    surface: frame.surface,
    frameTime: frame.frameTime,
  })
}
