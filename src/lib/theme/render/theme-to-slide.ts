import type { Slide } from "@/types/slide"
import type { Theme } from "@/types/theme"

/**
 * Project a {@link Theme} to a renderable {@link Slide} (themeredo.md, Phase 1).
 *
 * A theme is already a styled single slide, so this is mostly a faithful copy:
 * it lets the theme library render its thumbnails through the *slide* renderer
 * immediately, without any special theme-preview path. The theme's authored
 * placeholders (sample verse text, "10:00", "Sermon Title", …) are kept as-is —
 * this is a design-time preview, not a go-live fill, so no live content is
 * substituted here (that is the Phase 4 presentation mappers' job).
 *
 * PURE: `background`/`elements` are deep-cloned so the preview never shares
 * structure with — or mutates — the source theme; `newId`/`now` are injected for
 * determinism (matching `preview-slide.ts`).
 */
export function themeToSlide(theme: Theme, newId: () => string, now = 0): Slide {
  return {
    id: newId(),
    name: theme.name,
    background: structuredClone(theme.background),
    elements: theme.elements.map((el) => structuredClone(el)),
    transition: theme.transition ? structuredClone(theme.transition) : undefined,
    createdAt: now,
    updatedAt: now,
  }
}
