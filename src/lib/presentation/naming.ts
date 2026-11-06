import type { Presentation } from "@/types/slide"

/**
 * Presentation-name uniqueness helpers. Deck names in the library must be
 * unique (case-insensitively, trimmed) so operators can tell decks apart at a
 * glance and never overwrite one by accident. Pure — no zustand, no I/O.
 */

/**
 * Case-insensitive, trimmed check for whether `name` is already used by another
 * deck. `excludeId` skips the deck currently being renamed so it doesn't collide
 * with itself.
 */
export function isPresentationNameTaken(
  presentations: Presentation[],
  name: string,
  excludeId?: string
): boolean {
  const target = name.trim().toLowerCase()
  return presentations.some(
    (p) => p.id !== excludeId && p.name.trim().toLowerCase() === target
  )
}

/**
 * Suggest a unique deck name derived from `base`: returns `base` (trimmed) when
 * it's free, otherwise appends " (2)", " (3)", … until an unused name is found.
 * Used to pre-fill the rename prompt shown on an import collision. Empty input
 * falls back to "Presentation".
 */
export function makeUniquePresentationName(
  presentations: Presentation[],
  base: string,
  excludeId?: string
): string {
  const trimmed = base.trim() || "Presentation"
  if (!isPresentationNameTaken(presentations, trimmed, excludeId))
    return trimmed
  for (let n = 2; ; n++) {
    const candidate = `${trimmed} (${n})`
    if (!isPresentationNameTaken(presentations, candidate, excludeId)) {
      return candidate
    }
  }
}
