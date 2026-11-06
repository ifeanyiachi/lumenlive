import type { Theme } from "@/types/theme"
import { themeToSlide } from "../render"
import { swapTextRole } from "./_shared"
import type { PresentedSlide, SongContent } from "./types"

/**
 * Present a Song theme with its lyric groups (themeredo.md, Phase 4).
 *
 * Each group (verse/chorus block) materializes into its own slide, the group's
 * text swapped into the `role:"lyrics"` placeholder (element-swap — text roles
 * are baked in, unlike scripture). Advancing groups therefore advances slides.
 *
 * An empty `groups` list yields a single slide with the lyrics placeholder
 * cleared, so a song that hasn't been cued still presents its styled backdrop.
 */
export function presentSong(
  theme: Theme,
  content: SongContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  const groups = content.groups.length > 0 ? content.groups : [""]
  return groups.map((group) => {
    const slide = themeToSlide(theme, newId, now)
    swapTextRole(slide.elements, "lyrics", group)
    return { slide }
  })
}
