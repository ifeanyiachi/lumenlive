// The type-first theme model (themeredo.md, Phase 1) — pure constructors,
// validation, and placeholder-role helpers over the new `Theme` type. No React,
// Zustand, or Tauri here.

export {
  TEXT_PLACEHOLDER_ROLES,
  isTextRole,
  findTextRole,
  hasTextRole,
  findScriptureElement,
  hasScriptureElement,
  findTimerElement,
  hasTimerElement,
} from "./roles"

export {
  REQUIRED_PLACEHOLDERS,
  validateTheme,
  isValidTheme,
  type PlaceholderSpec,
  type ThemeValidationResult,
} from "./validation"

export {
  DEFAULT_THEME_RESOLUTION,
  createTheme,
  updateTheme,
  type CreateThemeInput,
} from "./constructors"
