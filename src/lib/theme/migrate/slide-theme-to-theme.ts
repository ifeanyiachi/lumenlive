import type {
  SlideBackground,
  SlideElement,
  SlideScriptureElement,
  SlideTextElement,
  SlideTheme,
  SlideThemeVariant,
  TextPlaceholderRole,
} from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"
import {
  DEFAULT_THEME_RESOLUTION,
  hasScriptureElement,
  hasTextRole,
} from "@/lib/theme/model"

/**
 * One-time migrator: an authored {@link SlideTheme} (the legacy slide/song theme,
 * a set of layout `variants`) → the type-first {@link Theme} model (themeredo.md,
 * Phase 5). The sibling of {@link import("./broadcast-to-theme").broadcastToTheme}
 * for the *other* legacy authoring surface — `presentations.json`'s
 * `customSlideThemes`.
 *
 * A `SlideTheme` carries several `variants` (one per layout); a `Theme` is a
 * single styled slide. We collapse to the representative variant for the type
 * (the lyric/scripture content variant, not a title or blank), lift its
 * background + elements, and guarantee the type's required placeholder by tagging
 * the primary content element with a `role` (or synthesising one). Fidelity is
 * *structural*, not pixel-parity — nothing authored is dropped.
 *
 * PURE: `newId`/`now` injected (no `crypto`/`Date.now()` inline); the result
 * shares no mutable structure with the input (`structuredClone` per element).
 */

/** Map a legacy {@link SlideTheme} category to the intrinsic {@link ThemeType}. */
export function slideCategoryToType(
  category: SlideTheme["category"]
): ThemeType {
  // Slide themes only ever carried three categories; "general" custom themes are
  // authored song looks in practice, so they fold to song (the type-first model
  // has no "general"), while a scripture slide theme keeps its scripture type.
  return category === "scripture" ? "scripture" : "song"
}

/**
 * Pick the variant that best represents the theme's *content* look for its type:
 * the scripture layout for a scripture theme, else the plain content variant a
 * song's lyrics fill, falling back to the first non-blank variant, then the first.
 */
function pickVariant(
  variants: readonly SlideThemeVariant[],
  type: ThemeType
): SlideThemeVariant | undefined {
  if (variants.length === 0) return undefined
  const byLayout = (l: SlideThemeVariant["layout"]) =>
    variants.find((v) => v.layout === l)
  const preferred =
    type === "scripture" ? byLayout("scripture") : byLayout("content-only")
  return (
    preferred ??
    variants.find((v) => v.layout !== "blank") ??
    variants[0]
  )
}

/** Area of an element in percent-space, used to rank the primary content box. */
function area(el: SlideElement): number {
  return el.width * el.height
}

/**
 * Ensure `elements` contains the placeholder `type` requires, returning a new
 * array. For a song theme this tags the largest untagged text element with
 * `role:"lyrics"` (the box the lyric lines were always drawn in); for scripture
 * it keeps any existing scripture element. When nothing suitable exists a
 * frame-filling placeholder is synthesised so the migrated theme always
 * validates.
 */
function ensurePlaceholder(
  elements: SlideElement[],
  type: ThemeType,
  newId: () => string
): SlideElement[] {
  if (type === "scripture") {
    if (hasScriptureElement(elements)) return elements
    return [...elements, synthScripture(newId)]
  }

  // song
  if (hasTextRole(elements, "lyrics")) return elements
  // Promote the largest untagged text element to the lyrics placeholder.
  const candidates = elements
    .map((el, index) => ({ el, index }))
    .filter(({ el }) => el.type === "text" && el.role === undefined)
    .sort((a, b) => area(b.el) - area(a.el))
  const primary = candidates[0]
  if (primary) {
    return elements.map((el, i) =>
      i === primary.index ? { ...(el as SlideTextElement), role: "lyrics" } : el
    )
  }
  return [...elements, synthText(newId, "lyrics")]
}

/** A frame-filling text placeholder carrying `role`, for the no-content case. */
function synthText(
  newId: () => string,
  role: TextPlaceholderRole
): SlideTextElement {
  return {
    id: newId(),
    type: "text",
    x: 10,
    y: 30,
    width: 80,
    height: 40,
    role,
    text: "",
    fontFamily: "Inter",
    fontSize: 48,
    fontWeight: 600,
    bold: false,
    italic: false,
    underline: false,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.4,
    textTransform: "none",
  }
}

/** A frame-filling scripture placeholder, for the no-content case. */
function synthScripture(newId: () => string): SlideScriptureElement {
  return {
    id: newId(),
    type: "scripture",
    x: 10,
    y: 20,
    width: 80,
    height: 60,
    reference: "",
    verseText: "",
    translation: "",
    fontFamily: "Inter",
    fontSize: 40,
    fontWeight: 400,
    bold: false,
    italic: false,
    color: "#ffffff",
    horizontalAlign: "center",
    verticalAlign: "middle",
    lineHeight: 1.5,
    referenceFontSize: 24,
    referenceColor: "#cccccc",
  }
}

const DEFAULT_BACKGROUND: SlideBackground = { type: "solid", color: "#000000" }

/**
 * Migrate one {@link SlideTheme} to a {@link Theme}. Elements come from the
 * representative variant with fresh ids; the type's required placeholder is
 * guaranteed. `createdAt`/`updatedAt` are set to `now` (slide themes carry no
 * timestamps of their own).
 */
export function slideThemeToTheme(
  st: SlideTheme,
  newId: () => string,
  now = 0
): Theme {
  const type = slideCategoryToType(st.category)
  const variant = pickVariant(st.variants, type)

  const background: SlideBackground = variant
    ? structuredClone(variant.background)
    : { ...DEFAULT_BACKGROUND }

  const lifted: SlideElement[] = (variant?.elements ?? []).map(
    (el) => ({ ...structuredClone(el), id: newId() }) as SlideElement
  )
  const elements = ensurePlaceholder(lifted, type, newId)

  return {
    // Keep the source id so stored `themeId` references survive the store merge
    // (Phase 5c); elements are the ones that get fresh ids.
    id: st.id,
    name: st.name,
    type,
    builtin: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    resolution: { ...DEFAULT_THEME_RESOLUTION },
    background,
    elements,
  }
}
