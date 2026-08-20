import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import { swapTextRole } from "./_shared"
import type { PresentedSlide, SermonContent } from "./types"

/**
 * Present a Sermon theme (themeredo.md, Phase 4).
 *
 * Title + points are authored at build time into the `role:"title"` /
 * `role:"points"` placeholders, so this is static — a single slide. The optional
 * `title`/`points` overrides substitute live values without re-authoring; an
 * omitted override keeps the authored text.
 */
export function presentSermon(
  theme: Theme,
  content: SermonContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  const slide = themeToSlide(theme, newId, now)
  swapTextRole(slide.elements, "title", content.title)
  swapTextRole(slide.elements, "points", content.points)
  return [{ slide }]
}
