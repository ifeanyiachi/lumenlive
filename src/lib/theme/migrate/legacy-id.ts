/**
 * Legacy built-in id reconciliation for the namespace merge (themeredo.md).
 *
 * Custom themes keep their ids through migration, so a stored `themeId` that
 * pointed at a *custom* resolves against the new store unchanged. Built-ins are the
 * exception: the two old catalogs (14 broadcast + 19 slide built-ins) collapsed to
 * the 6 new `builtin-<type>` themes, so an id like `"builtin-classic-dark"` has no
 * literal match in the new store. This maps each legacy built-in id to the new
 * built-in of its intrinsic type.
 *
 * The map is hardcoded: the legacy catalogs (`lib/builtin-themes`, the broadcast
 * `SlideTheme`s) were deleted once `BroadcastTheme` was retired, so the mapping is
 * frozen — it only ever needs to resolve ids that real users persisted before the
 * migration. New-store ids and unknown (custom) ids pass through unchanged.
 */
const ALIAS: Record<string, string> = {
  // Legacy broadcast built-ins (BroadcastTheme, by category → type)
  "builtin-classic-dark": "builtin-scripture",
  "builtin-modern-light": "builtin-scripture",
  "builtin-broadcast-overlay": "builtin-overlay",
  "builtin-worship-night": "builtin-song",
  "builtin-hymnal": "builtin-song",
  "builtin-praise-bold": "builtin-song",
  "builtin-parchment": "builtin-scripture",
  "builtin-scripture-focus": "builtin-scripture",
  "builtin-sermon-clean": "builtin-sermon",
  "builtin-sermon-fullscreen": "builtin-sermon",
  "builtin-lower-third-dark": "builtin-overlay",
  "builtin-lower-third-glass": "builtin-overlay",
  "builtin-countdown-midnight": "builtin-countdown",
  "builtin-countdown-minimal": "builtin-countdown",
  // Legacy slide/song built-ins (SlideTheme, scripture → scripture, else → song)
  "theme-midnight": "builtin-song",
  "theme-warm-glow": "builtin-song",
  "theme-ocean": "builtin-song",
  "theme-forest": "builtin-song",
  "theme-clean-white": "builtin-song",
  "theme-worship-lyrics": "builtin-song",
  "theme-lyric-glow": "builtin-song",
  "theme-hymnal": "builtin-song",
  "theme-scripture-classic": "builtin-scripture",
  "theme-scripture-warm": "builtin-scripture",
  "theme-ember": "builtin-song",
  "theme-royal-purple": "builtin-song",
  "theme-aurora-worship": "builtin-song",
  "theme-golden-bokeh": "builtin-song",
  "theme-ember-glow": "builtin-song",
  "theme-starry-host": "builtin-song",
  "theme-silent-night": "builtin-song",
  "theme-light-of-the-world": "builtin-song",
  "theme-flowing-grace": "builtin-song",
}

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
