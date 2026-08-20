// The built-in theme catalog for the type-first model (themeredo.md, Phase 1).
// One `Theme` per `ThemeType`, as deterministic code constants — the successor
// to `BUILTIN_THEMES` (broadcast) + `BUILTIN_SLIDE_THEMES` (slide). Nothing here
// is persisted; customs live in the themes store.

import type { Theme, ThemeType } from "@/types/theme"
import { SCRIPTURE_BUILTIN } from "./scripture"
import { SONG_BUILTIN } from "./song"
import { COUNTDOWN_BUILTIN } from "./countdown"
import { SERMON_BUILTIN } from "./sermon"
import { OVERLAY_BUILTIN } from "./overlay"
import { ANNOUNCEMENT_BUILTIN } from "./announcement"

export {
  SCRIPTURE_BUILTIN,
  SONG_BUILTIN,
  COUNTDOWN_BUILTIN,
  SERMON_BUILTIN,
  OVERLAY_BUILTIN,
  ANNOUNCEMENT_BUILTIN,
}

/** Every built-in theme, one per type, in `ThemeType` order. */
export const BUILTIN_THEMES: Theme[] = [
  SCRIPTURE_BUILTIN,
  SONG_BUILTIN,
  COUNTDOWN_BUILTIN,
  SERMON_BUILTIN,
  OVERLAY_BUILTIN,
  ANNOUNCEMENT_BUILTIN,
]

/** The single built-in theme for a given type. */
export const BUILTIN_THEME_BY_TYPE: Record<ThemeType, Theme> = {
  scripture: SCRIPTURE_BUILTIN,
  song: SONG_BUILTIN,
  countdown: COUNTDOWN_BUILTIN,
  sermon: SERMON_BUILTIN,
  overlay: OVERLAY_BUILTIN,
  announcement: ANNOUNCEMENT_BUILTIN,
}
