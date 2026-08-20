// One-time data migration to the type-first theme model (themeredo.md, Phase 5).
// `BroadcastTheme` (verse/countdown authoring) → `Theme`. This is the bridge whose
// absence gated the live scripture/countdown flips; it converts identity,
// background, decorative elements, and the verse region → a typed placeholder
// without data loss.

export { broadcastToTheme, categoryToType } from "./broadcast-to-theme"
export { slideThemeToTheme, slideCategoryToType } from "./slide-theme-to-theme"
export { backgroundToSlide } from "./background"
export {
  ingestLegacyThemes,
  type LegacyThemeSources,
  type IngestResult,
} from "./ingest"
