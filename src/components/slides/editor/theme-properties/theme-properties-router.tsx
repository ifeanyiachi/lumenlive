import type { Slide } from "@/types/slide"
import type { ThemeType } from "@/types/theme"
import { ScriptureThemeProperties } from "./scripture-theme-properties"
import { SongThemeProperties } from "./song-theme-properties"
import { CountdownThemeProperties } from "./countdown-theme-properties"
import { SermonThemeProperties } from "./sermon-theme-properties"
import { OverlayThemeProperties } from "./overlay-theme-properties"
import { AnnouncementThemeProperties } from "./announcement-theme-properties"

/**
 * Mounts the type-specific theme properties panel for the theme being authored
 * (themeredo.md, Phase 3). Shown when a type-first theme session is active and no
 * element is selected — element-level controls still route through
 * `ElementPropertiesRouter`. There is intentionally no generic/"general" panel.
 */
export function ThemePropertiesRouter({
  type,
  slide,
}: {
  type: ThemeType
  slide: Slide
}) {
  switch (type) {
    case "scripture":
      return <ScriptureThemeProperties elements={slide.elements} />
    case "song":
      return <SongThemeProperties elements={slide.elements} />
    case "countdown":
      return <CountdownThemeProperties elements={slide.elements} />
    case "sermon":
      return <SermonThemeProperties elements={slide.elements} />
    case "announcement":
      return <AnnouncementThemeProperties elements={slide.elements} />
    case "overlay":
      return <OverlayThemeProperties background={slide.background} />
  }
}
