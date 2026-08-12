import type {
  Slide,
  SlideBackground,
  SlideElement,
  SlideLayoutVariant,
  SlideTheme,
} from "@/types/slide"

/**
 * Build a renderable preview {@link Slide} from a slide/song theme, for the
 * unified Theme Designer thumbnail (theme-unification-plan.md, Phase 2).
 *
 * Picks the `content-only` variant (the representative "just the lyric on the
 * backdrop" look), falling back to the theme's first variant. Backgrounds and
 * elements are deep-cloned so the preview never shares structure with — or
 * mutates — the built-in theme. Theme elements omit their `id` (minted on apply),
 * so a fresh id is stamped here.
 *
 * PURE: `newId`/`now` are injected for determinism (see the codebase convention
 * in `song-to-slides.ts` / `presentation-mutations.ts`).
 */

const FALLBACK_BACKGROUND: SlideBackground = { type: "solid", color: "#1a1a2e" }

export function buildThemePreviewSlide(
  theme: SlideTheme,
  newId: () => string,
  now = 0,
  preferred: SlideLayoutVariant = "content-only"
): Slide {
  const variant =
    theme.variants.find((v) => v.layout === preferred) ?? theme.variants[0]
  return {
    id: newId(),
    name: theme.name,
    background: variant
      ? structuredClone(variant.background)
      : { ...FALLBACK_BACKGROUND },
    elements: variant
      ? variant.elements.map(
          (el) => ({ ...structuredClone(el), id: newId() }) as SlideElement
        )
      : [],
    createdAt: now,
    updatedAt: now,
  }
}
