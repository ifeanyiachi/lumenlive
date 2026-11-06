// Legacy-data helpers retained after the one-time BroadcastTheme/SlideTheme ingest
// was retired (themeredo.md): the canvas-background → SlideBackground converter
// (used by the base-backdrop resolver) and the legacy built-in id alias (resolves
// ids that real users persisted before the type-first migration).

export { backgroundToSlide } from "./background"
export { legacyThemeIdAlias, resolveLegacyThemeId } from "./legacy-id"
