import type { SlideElement, TextPlaceholderRole } from "@/types/slide"
import { findTextRole } from "../model"

/**
 * Element-swap a text placeholder's content in place (themeredo.md, Phase 4).
 *
 * `elements` must already be a fresh clone (mappers build on `themeToSlide`), so
 * this mutates safely without touching the source theme. A no-op `text` (i.e.
 * `undefined`) leaves the authored placeholder text as-is — used by the
 * static-type mappers whose live overrides are optional.
 */
export function swapTextRole(
  elements: SlideElement[],
  role: TextPlaceholderRole,
  text: string | undefined
): void {
  if (text === undefined) return
  const el = findTextRole(elements, role)
  if (el) el.text = text
}
