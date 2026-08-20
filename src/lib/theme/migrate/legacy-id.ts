import type { ThemeType } from "@/types/theme"
import { BUILTIN_THEMES as LEGACY_BROADCAST_BUILTINS } from "@/lib/builtin-themes"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import { BUILTIN_THEMES as NEW_BUILTINS } from "@/lib/theme/builtins"
import { categoryToType } from "./broadcast-to-theme"
import { slideCategoryToType } from "./slide-theme-to-theme"

/**
 * Legacy built-in id reconciliation for the namespace merge (themeredo.md, Phase
 * 5 / flip F2).
 *
 * Custom themes keep their ids through migration (Phase 5c), so a stored `themeId`
 * that pointed at a *custom* resolves against the new store unchanged. Built-ins
 * are the exception: the two old catalogs (14 broadcast + N slide) collapsed to
 * the 6 new `builtin-<type>` themes, so an id like `"builtin-classic-dark"` has no
 * literal match in the new store. This maps each legacy built-in id to the new
 * built-in of its intrinsic type — fully mechanical via `categoryToType` /
 * `slideCategoryToType`, so it stays correct if a catalog changes.
 *
 * PURE data derivation at module load (no I/O); the legacy + new catalogs are
 * plain constants.
 */

/** The new built-in id for a type, or a `builtin-<type>` fallback. */
function newBuiltinIdForType(type: ThemeType): string {
  return NEW_BUILTINS.find((t) => t.type === type)?.id ?? `builtin-${type}`
}

const ALIAS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const t of LEGACY_BROADCAST_BUILTINS) {
    map[t.id] = newBuiltinIdForType(categoryToType(t.category))
  }
  for (const t of BUILTIN_SLIDE_THEMES) {
    map[t.id] = newBuiltinIdForType(slideCategoryToType(t.category))
  }
  return map
})()

/**
 * The new-store id a legacy built-in id maps to, or `undefined` when `id` is not a
 * known legacy built-in (a custom id — which is preserved and needs no alias).
 */
export function legacyThemeIdAlias(id: string): string | undefined {
  return ALIAS[id]
}

/**
 * Resolve any stored `themeId` to the id it addresses in the new store: a legacy
 * built-in id is aliased to its new-built-in equivalent; every other id (a
 * preserved custom, or an already-new id) passes through unchanged.
 */
export function resolveLegacyThemeId(id: string): string {
  return ALIAS[id] ?? id
}
