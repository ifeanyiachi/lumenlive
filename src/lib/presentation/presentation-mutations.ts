import type {
  Presentation,
  Slide,
  SlideElement,
  SlideTextElement,
} from "@/types/slide"
import type { Theme } from "@/types/theme"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"
import { migrateSlideElements } from "@/lib/slide-migration"

/**
 * Pure presentation-catalog transforms: duplication, JSON import/export, and
 * theme application. No zustand, no I/O — ids (`newId`) and timestamps (`now`)
 * are injected for determinism.
 */

/** Deep-copy a presentation with fresh ids for the deck, slides, and elements. */
export function duplicatePresentation(
  original: Presentation,
  newId: () => string,
  now: number
): Presentation {
  return {
    ...original,
    id: newId(),
    name: `${original.name} (Copy)`,
    slides: original.slides.map((slide) => {
      // Deep-clone so the copy shares no nested objects (shadow/outline/
      // animation, gradient stops) with the source deck; then re-id.
      const cloned = structuredClone(slide)
      cloned.id = newId()
      cloned.elements = cloned.elements.map((e) => ({ ...e, id: newId() }))
      return cloned
    }),
    createdAt: now,
    updatedAt: now,
  }
}

/** Serialize a presentation to pretty-printed JSON. */
export function exportToJson(presentation: Presentation): string {
  return JSON.stringify(presentation, null, 2)
}

/**
 * Parse and normalise an imported presentation: validate it has a `slides`
 * array, assign fresh ids, tag the name as "(Imported)", and stamp timestamps.
 * Returns `null` for malformed input.
 */
export function importFromJson(
  json: string,
  newId: () => string,
  now: number
): Presentation | null {
  try {
    const parsed = JSON.parse(json) as Presentation
    if (!parsed.slides || !Array.isArray(parsed.slides)) return null
    const imported: Presentation = {
      ...parsed,
      id: newId(),
      name: parsed.name ? `${parsed.name} (Imported)` : "Imported Presentation",
      createdAt: now,
      updatedAt: now,
      slides: parsed.slides.map((slide: Slide) => ({
        ...slide,
        id: newId(),
        elements: (slide.elements ?? []).map((el: SlideElement) => ({
          ...el,
          id: newId(),
        })),
      })),
    }
    // Upgrade legacy elements that predate the `type` discriminant, matching the
    // stored-load path so both entry points produce the same typed shape.
    return migrateSlideElements([imported])[0]
  } catch {
    return null
  }
}

// ── Theme application (themeredo.md, 3C — bake-in model) ──
//
// Applying a `Theme` to a deck is a one-shot **bake**: the theme's background is
// copied onto the slide(s) and its text typography is stamped onto the slide's
// existing text elements. There is no `Slide.themeId` reference — the look is
// baked into the slide data, and re-applying a theme is how you change it. This
// keeps each slide's own content and layout (text strings, positions, non-text
// elements) while restyling it to match the theme.

/** The text-styling fields a theme bakes onto existing slide text. */
type Typography = Pick<
  SlideTextElement,
  | "fontFamily"
  | "fontSize"
  | "fontWeight"
  | "bold"
  | "italic"
  | "underline"
  | "color"
  | "letterSpacing"
  | "lineHeight"
  | "textTransform"
  | "shadow"
  | "outline"
>

/**
 * The typography of a theme's representative text element — its role-carrying
 * placeholder (lyrics/title/body) if present, else its first plain text element.
 * `null` when the theme has no text element to borrow styling from (e.g. a bare
 * scripture or countdown look), in which case only the background is baked.
 */
function themeTypography(theme: Theme): Typography | null {
  const texts = theme.elements.filter(
    (e): e is SlideTextElement => e.type === "text"
  )
  const source = texts.find((t) => t.role != null) ?? texts[0]
  if (!source) return null
  return {
    fontFamily: source.fontFamily,
    fontSize: source.fontSize,
    fontWeight: source.fontWeight,
    bold: source.bold,
    italic: source.italic,
    underline: source.underline,
    color: source.color,
    letterSpacing: source.letterSpacing,
    lineHeight: source.lineHeight,
    textTransform: source.textTransform,
    shadow: source.shadow ? structuredClone(source.shadow) : undefined,
    outline: source.outline ? structuredClone(source.outline) : undefined,
  }
}

/** Resolve a deck-theme id (aliasing legacy ids) against the given pool. */
function findDeckTheme(themeId: string, themes: Theme[]): Theme | undefined {
  const id = resolveLegacyThemeId(themeId)
  return themes.find((t) => t.id === id)
}

/**
 * Bake a theme's background + typography onto one slide: replace the background,
 * and stamp the theme's text styling onto every text element (preserving each
 * element's text, position, id, and any non-text elements). Pure — deep-clones
 * shared theme data so the slide never aliases the built-in constant.
 */
function bakeThemeOntoSlide(slide: Slide, theme: Theme, now: number): Slide {
  const typo = themeTypography(theme)
  return {
    ...slide,
    background: structuredClone(theme.background),
    elements: typo
      ? slide.elements.map((el) =>
          el.type === "text" ? ({ ...el, ...typo } as SlideElement) : el
        )
      : slide.elements,
    updatedAt: now,
  }
}

/**
 * Bake a theme onto a single slide (by index). Returns `null` when the theme is
 * unknown or the index is out of range.
 */
export function applyThemeToSlideAt(
  draft: Presentation,
  index: number,
  themeId: string,
  now: number,
  themes: Theme[]
): Presentation | null {
  const theme = findDeckTheme(themeId, themes)
  if (!theme) return null
  if (index < 0 || index >= draft.slides.length) return null
  const slides = draft.slides.map((slide, i) =>
    i === index ? bakeThemeOntoSlide(slide, theme, now) : slide
  )
  return { ...draft, slides, updatedAt: now }
}

/**
 * Bake a theme onto every slide in the deck. Returns `null` when the theme is
 * unknown.
 */
export function applyThemeToDeck(
  draft: Presentation,
  themeId: string,
  now: number,
  themes: Theme[]
): Presentation | null {
  const theme = findDeckTheme(themeId, themes)
  if (!theme) return null
  const slides = draft.slides.map((slide) =>
    bakeThemeOntoSlide(slide, theme, now)
  )
  return { ...draft, slides, updatedAt: now }
}
