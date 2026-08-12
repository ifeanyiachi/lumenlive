import type {
  Slide,
  SlideElement,
  SlideTheme,
  SlideThemeElement,
} from "@/types/slide"
import { buildThemePreviewSlide } from "./preview-slide"

/**
 * `SlideTheme` ↔ editable `Slide` conversions for authoring custom song themes
 * in the full slide editor (theme-unification-plan.md, Phase 3, "reuse the slide
 * editor").
 *
 * A song theme is authored by editing ONE slide — the theme's `content-only`
 * variant (background + the lyric/placeholder elements). On save the edited slide
 * becomes a `SlideTheme` with two variants:
 *   - `content-only` — the edited background + elements (the lyric look), and
 *   - `blank` — the same background with no elements (the "clear" end slide),
 * matching how `generateSlidesFromSong` uses these two layouts.
 *
 * PURE: `newId`/`now` injected for determinism (codebase convention).
 */

/** Strip the `id` off a slide element to get its theme-element form. */
function toThemeElement(el: SlideElement): SlideThemeElement {
  const clone = structuredClone(el) as unknown as Record<string, unknown>
  delete clone.id
  return clone as unknown as SlideThemeElement
}

/**
 * Turn a slide theme into the single editable `Slide` the slide editor works on
 * (its `content-only` variant, falling back to the first). Thin alias over
 * {@link buildThemePreviewSlide} so authoring and thumbnails share one lifter.
 */
export function slideThemeToEditableSlide(
  theme: SlideTheme,
  newId: () => string,
  now = 0
): Slide {
  return buildThemePreviewSlide(theme, newId, now)
}

/**
 * Convert an edited `Slide` back into a custom `SlideTheme`. Produces the
 * `content-only` + derived `blank` variant pair; always `builtin: false`.
 */
export function editableSlideToSlideTheme(
  slide: Slide,
  meta: { id: string; name: string; category?: SlideTheme["category"] }
): SlideTheme {
  const background = structuredClone(slide.background)
  const elements = slide.elements.map(toThemeElement)
  return {
    id: meta.id,
    name: meta.name,
    category: meta.category ?? "song",
    builtin: false,
    variants: [
      { layout: "content-only", background, elements },
      { layout: "blank", background: structuredClone(background), elements: [] },
    ],
  }
}

/** A sensible starting point for a brand-new custom song theme. */
export function createDraftSlideTheme(
  meta: { id: string; name: string },
  newId: () => string,
  now = 0
): { theme: SlideTheme; slide: Slide } {
  const lyric: SlideThemeElement = {
    type: "text",
    text: "Verse lyrics here",
    x: 5,
    y: 15,
    width: 90,
    height: 70,
    fontFamily: "Inter",
    fontSize: 52,
    fontWeight: 600,
    bold: false,
    italic: false,
    underline: false,
    color: "#f8fafc",
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.4,
    textTransform: "none",
  }
  const theme: SlideTheme = {
    id: meta.id,
    name: meta.name,
    category: "song",
    builtin: false,
    variants: [
      {
        layout: "content-only",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#1e1b4b" },
              { offset: 1, color: "#0f172a" },
            ],
          },
        },
        elements: [lyric],
      },
      {
        layout: "blank",
        background: {
          type: "gradient",
          gradient: {
            type: "radial",
            stops: [
              { offset: 0, color: "#1e1b4b" },
              { offset: 1, color: "#0f172a" },
            ],
          },
        },
        elements: [],
      },
    ],
  }
  return { theme, slide: slideThemeToEditableSlide(theme, newId, now) }
}
