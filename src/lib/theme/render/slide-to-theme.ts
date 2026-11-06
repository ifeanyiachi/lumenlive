import type { Slide } from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"

/**
 * Project an edited {@link Slide} back into a {@link Theme} (themeredo.md,
 * Phase 3) — the inverse of {@link themeToSlide}. The editor authors a theme as a
 * single-slide draft; on Save its background/elements/transition are folded back
 * onto the theme's stable identity (`id`/`type`/`name`/`pinned`/`createdAt`).
 *
 * Identity is supplied by the caller, not read off the slide, because the slide's
 * `id` is an ephemeral editor id and a theme's `type` is intrinsic and never
 * derivable from geometry. `resolution` is carried through unchanged.
 *
 * PURE: `background`/`elements`/`transition` are deep-cloned so the saved theme
 * never shares mutable structure with the live editor draft; `now` is injected.
 */
export interface ThemeIdentity {
  id: string
  type: ThemeType
  name: string
  pinned: boolean
  createdAt: number
  resolution: { width: number; height: number }
}

export function slideToTheme(
  slide: Slide,
  identity: ThemeIdentity,
  now = 0
): Theme {
  return {
    id: identity.id,
    name: identity.name,
    type: identity.type,
    builtin: false,
    pinned: identity.pinned,
    createdAt: identity.createdAt,
    updatedAt: now,
    resolution: { ...identity.resolution },
    background: structuredClone(slide.background),
    elements: slide.elements.map((el) => structuredClone(el)),
    transition: slide.transition
      ? structuredClone(slide.transition)
      : undefined,
  }
}
