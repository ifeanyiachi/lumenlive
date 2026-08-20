import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import type { OverlayContent, PresentedSlide } from "./types"

/**
 * Present an Overlay / lower-third theme (themeredo.md, Phase 4).
 *
 * Overlays are fully authored and composite over live output via their
 * transparent background — there is no required placeholder to fill, so this is
 * a faithful single-slide projection. `_content` is accepted for a uniform
 * mapper signature.
 */
export function presentOverlay(
  theme: Theme,
  _content: OverlayContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  return [{ slide: themeToSlide(theme, newId, now) }]
}
