import type {
  Presentation,
  Slide,
  SlideElement,
  SlideLayoutVariant,
} from "@/types/slide"
import { BUILTIN_SLIDE_THEMES, migrateSlideElements } from "@/types/slide"

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

/** The slide-level content a theme variant contributes. */
export interface ThemeSlideContent {
  background: Slide["background"]
  elements: SlideElement[]
}

/**
 * Resolve the background + freshly-id'd elements for applying a theme variant to
 * a single slide. Returns `null` when the theme or a usable variant is missing.
 */
export function resolveThemeSlideContent(
  themeId: string,
  variant: SlideLayoutVariant,
  newId: () => string
): ThemeSlideContent | null {
  const theme = BUILTIN_SLIDE_THEMES.find((t) => t.id === themeId)
  if (!theme) return null
  const v =
    theme.variants.find((vr) => vr.layout === variant) ?? theme.variants[0]
  if (!v) return null
  // Deep-clone from the shared BUILTIN_SLIDE_THEMES constant so mutating a
  // slide never corrupts the builtin (or another slide cloned from it).
  return {
    background: structuredClone(v.background),
    elements: v.elements.map(
      (el) => ({ ...structuredClone(el), id: newId() }) as SlideElement
    ),
  }
}

/**
 * Apply a theme's background to every slide in the deck (using each theme's
 * "content-only" variant, falling back to its first). Returns `null` when the
 * theme is unknown.
 */
export function applyThemeToAllSlides(
  draft: Presentation,
  themeId: string,
  now: number
): Presentation | null {
  const theme = BUILTIN_SLIDE_THEMES.find((t) => t.id === themeId)
  if (!theme) return null
  const slides = draft.slides.map((slide) => {
    const v =
      theme.variants.find((vr) => vr.layout === "content-only") ??
      theme.variants[0]
    if (!v) return slide
    return {
      ...slide,
      background: structuredClone(v.background),
      updatedAt: now,
    }
  })
  return { ...draft, slides, updatedAt: now }
}
