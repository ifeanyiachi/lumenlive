import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import { swapTextRole } from "./_shared"
import type { AnnouncementContent, PresentedSlide } from "./types"

/**
 * Present an Announcement theme (themeredo.md, Phase 4).
 *
 * Title + body are authored into the `role:"title"` / `role:"body"`
 * placeholders — static, a single slide. Optional `title`/`body` overrides
 * substitute live values; omitted overrides keep the authored text.
 */
export function presentAnnouncement(
  theme: Theme,
  content: AnnouncementContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  const slide = themeToSlide(theme, newId, now)
  swapTextRole(slide.elements, "title", content.title)
  swapTextRole(slide.elements, "body", content.body)
  return [{ slide }]
}
