import type { Theme } from "@/types/theme"
import { BUILTIN_THEMES } from "./builtins"

/**
 * Pure registry helpers for the type-first theme model (themeredo.md, Phase 1).
 *
 * The full library is the code-defined built-ins followed by the user's custom
 * themes (from the themes store). Keeping the merge here — not in the store —
 * lets any consumer build the list without a store import, and keeps the store
 * holding only serializable custom data.
 */

/** The full theme library: built-ins first, then the given customs. */
export function buildThemeRegistry(customThemes: readonly Theme[]): Theme[] {
  return [...BUILTIN_THEMES, ...customThemes]
}

/** Find a theme by id across built-ins + customs, or `undefined`. */
export function findThemeById(
  customThemes: readonly Theme[],
  id: string
): Theme | undefined {
  return buildThemeRegistry(customThemes).find((t) => t.id === id)
}
