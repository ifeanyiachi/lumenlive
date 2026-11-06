import type {
  SlideElement,
  SlideScriptureElement,
  SlideTextElement,
  SlideTimerElement,
  TextPlaceholderRole,
} from "@/types/slide"

/**
 * Placeholder-role helpers for the type-first theme model (themeredo.md).
 *
 * A theme's typed placeholders are found by role: text placeholders carry a
 * `role` marker (`"lyrics" | "title" | "points" | "body"`), while scripture and
 * timer placeholders are dedicated element types. These pure helpers
 * are the one place that knows how to locate a placeholder inside a theme's
 * `elements[]`, so the model, builders, and presentation mappers never re-scan
 * the array by hand.
 */

/** Every text placeholder role, in a stable order. */
export const TEXT_PLACEHOLDER_ROLES = [
  "lyrics",
  "title",
  "points",
  "body",
] as const satisfies readonly TextPlaceholderRole[]

/** True when `el` is a text element carrying the given placeholder `role`. */
export function isTextRole(
  el: SlideElement,
  role: TextPlaceholderRole
): el is SlideTextElement {
  return el.type === "text" && el.role === role
}

/** The first text element with the given `role`, or `undefined`. */
export function findTextRole(
  elements: readonly SlideElement[],
  role: TextPlaceholderRole
): SlideTextElement | undefined {
  return elements.find((el): el is SlideTextElement => isTextRole(el, role))
}

/** True when at least one text element carries the given `role`. */
export function hasTextRole(
  elements: readonly SlideElement[],
  role: TextPlaceholderRole
): boolean {
  return findTextRole(elements, role) !== undefined
}

/** The first scripture element, or `undefined`. */
export function findScriptureElement(
  elements: readonly SlideElement[]
): SlideScriptureElement | undefined {
  return elements.find(
    (el): el is SlideScriptureElement => el.type === "scripture"
  )
}

/** True when the theme contains a scripture placeholder. */
export function hasScriptureElement(
  elements: readonly SlideElement[]
): boolean {
  return findScriptureElement(elements) !== undefined
}

/** The first timer element (the Countdown placeholder), or `undefined`. */
export function findTimerElement(
  elements: readonly SlideElement[]
): SlideTimerElement | undefined {
  return elements.find((el): el is SlideTimerElement => el.type === "timer")
}

/** True when the theme contains a timer placeholder. */
export function hasTimerElement(elements: readonly SlideElement[]): boolean {
  return findTimerElement(elements) !== undefined
}
