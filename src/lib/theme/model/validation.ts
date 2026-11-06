import type { SlideElement, TextPlaceholderRole } from "@/types/slide"
import type { Theme, ThemeType } from "@/types/theme"
import { hasScriptureElement, hasTextRole, hasTimerElement } from "./roles"

/**
 * Theme validation for the type-first model (themeredo.md).
 *
 * Each `ThemeType` requires a specific set of placeholders — the elements that
 * content flows into at go-live. A scripture theme *must* contain a scripture
 * placeholder; a song theme *must* contain a `role:"lyrics"` text element; an
 * overlay *must* have a transparent background so it can composite over live
 * output. Validation guards those invariants at construction and before persist,
 * so a theme can never reach presentation missing the slot its type promises.
 *
 * Pure: no I/O, no framework imports.
 */

/**
 * A required placeholder for a theme type. Either a dedicated element type
 * (scripture, timer) or a text element with a given role.
 */
export type PlaceholderSpec =
  | { kind: "scripture" }
  | { kind: "timer" }
  | { kind: "text"; role: TextPlaceholderRole }

/**
 * The placeholders each type must contain. Overlay has no required *element*,
 * but a separate transparent-background rule (below).
 */
export const REQUIRED_PLACEHOLDERS: Record<ThemeType, PlaceholderSpec[]> = {
  scripture: [{ kind: "scripture" }],
  song: [{ kind: "text", role: "lyrics" }],
  countdown: [{ kind: "timer" }],
  sermon: [
    { kind: "text", role: "title" },
    { kind: "text", role: "points" },
  ],
  overlay: [], // no required element; must have a transparent background.
  announcement: [
    { kind: "text", role: "title" },
    { kind: "text", role: "body" },
  ],
}

function hasPlaceholder(
  elements: readonly SlideElement[],
  spec: PlaceholderSpec
): boolean {
  switch (spec.kind) {
    case "scripture":
      return hasScriptureElement(elements)
    case "timer":
      return hasTimerElement(elements)
    case "text":
      return hasTextRole(elements, spec.role)
  }
}

function describePlaceholder(spec: PlaceholderSpec): string {
  switch (spec.kind) {
    case "scripture":
      return "a scripture placeholder"
    case "timer":
      return "a timer placeholder"
    case "text":
      return `a text placeholder with role "${spec.role}"`
  }
}

export interface ThemeValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Validate a theme against its type's placeholder requirements. Returns every
 * problem found (not just the first) so a builder can surface them together.
 */
export function validateTheme(theme: Theme): ThemeValidationResult {
  const errors: string[] = []

  for (const spec of REQUIRED_PLACEHOLDERS[theme.type]) {
    if (!hasPlaceholder(theme.elements, spec)) {
      errors.push(
        `${theme.type} theme must contain ${describePlaceholder(spec)}`
      )
    }
  }

  // Overlays composite over live output, so their background must be transparent.
  if (theme.type === "overlay" && theme.background.type !== "transparent") {
    errors.push("overlay theme must have a transparent background")
  }

  return { valid: errors.length === 0, errors }
}

/** True when the theme satisfies every requirement for its type. */
export function isValidTheme(theme: Theme): boolean {
  return validateTheme(theme).valid
}
