import type { Theme } from "@/types/theme"
import type { SlideTimerElement } from "@/types/slide"

/**
 * The representative background + text colours of a countdown {@link Theme}, for
 * the compact operator surfaces (the corner pill, the config swatch) that can't
 * render the full themed composition and just borrow its colours to stay on-brand.
 *
 * Background: a solid/gradient theme's colour (gradient → its first stop); any
 * media/transparent/animated background falls back to a translucent black. Text:
 * the timer element's base colour, or white when the theme carries no timer.
 *
 * PURE.
 */
export function countdownThemeColors(theme: Theme): {
  background: string
  text: string
} {
  const bg = theme.background
  const background =
    bg.type === "solid"
      ? (bg.color ?? "rgba(0,0,0,0.7)")
      : bg.type === "gradient"
        ? (bg.gradient?.stops[0]?.color ?? "rgba(0,0,0,0.7)")
        : "rgba(0,0,0,0.7)"
  const timer = theme.elements.find((e) => e.type === "timer") as
    | SlideTimerElement
    | undefined
  return { background, text: timer?.color ?? "#ffffff" }
}
