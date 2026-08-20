import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import type { CountdownContent, PresentedSlide } from "./types"

/**
 * Present a Countdown theme (themeredo.md, Phase 4).
 *
 * No content flows in: the theme's timer placeholder derives its own remaining
 * time from wall-clock at draw time (the renderer is handed `now`). So this is a
 * faithful single-slide projection — the live ticking is the renderer's job, not
 * the mapper's. `_content` is accepted for a uniform mapper signature.
 */
export function presentCountdown(
  theme: Theme,
  _content: CountdownContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  return [{ slide: themeToSlide(theme, newId, now) }]
}
