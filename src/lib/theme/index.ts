// The unified theme layer (theme-unification-plan.md, Phase 1). One identity +
// library surface over the broadcast (verse) and slide/song theme systems; the
// render payload stays native to each engine so output is byte-identical.

export {
  broadcastThemeToUnified,
  slideThemeToUnified,
  toBroadcastTheme,
  toSlideTheme,
  DEFAULT_SLIDE_RESOLUTION,
} from "./convert"
export { BUILTIN_UNIFIED_THEMES, buildUnifiedRegistry } from "./builtin-themes"
export { buildThemePreviewSlide } from "./preview-slide"
export {
  slideThemeToEditableSlide,
  editableSlideToSlideTheme,
  createDraftSlideTheme,
} from "./slide-theme-edit"
