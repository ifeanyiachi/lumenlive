// The built-in theme catalog for the type-first model (themeredo.md, Phase 1).
// One primary `Theme` per `ThemeType`, as deterministic code constants — the
// successor to `BUILTIN_THEMES` (broadcast) + `BUILTIN_SLIDE_THEMES` (slide).
// The Song type additionally ships a *look library* (song-library.ts) recreating
// the old song catalog's variety. Nothing here is persisted; customs live in the
// themes store.

import type { Theme, ThemeType } from "@/types/theme"
import { SCRIPTURE_BUILTIN } from "./scripture"
import { SONG_BUILTIN } from "./song"
import { SONG_LIBRARY_BUILTINS } from "./song-library"
import { COUNTDOWN_BUILTIN } from "./countdown"
import { SERMON_BUILTIN } from "./sermon"
import { OVERLAY_BUILTIN } from "./overlay"
import { ANNOUNCEMENT_BUILTIN } from "./announcement"

export {
  SCRIPTURE_BUILTIN,
  SONG_BUILTIN,
  SONG_LIBRARY_BUILTINS,
  COUNTDOWN_BUILTIN,
  SERMON_BUILTIN,
  OVERLAY_BUILTIN,
  ANNOUNCEMENT_BUILTIN,
}

/**
 * Every built-in theme. One primary per type, plus the extra Song looks (Lyric
 * Glow, Hymnal, and the seven animated presets) appended after the generic Song
 * default. Pickers list all of these; the "New" flow seeds from the per-type
 * primary in {@link BUILTIN_THEME_BY_TYPE}.
 */
export const BUILTIN_THEMES: Theme[] = [
  SCRIPTURE_BUILTIN,
  SONG_BUILTIN,
  ...SONG_LIBRARY_BUILTINS,
  COUNTDOWN_BUILTIN,
  SERMON_BUILTIN,
  OVERLAY_BUILTIN,
  ANNOUNCEMENT_BUILTIN,
]

/** The primary built-in theme for a given type (the "New"-flow seed). */
export const BUILTIN_THEME_BY_TYPE: Record<ThemeType, Theme> = {
  scripture: SCRIPTURE_BUILTIN,
  song: SONG_BUILTIN,
  countdown: COUNTDOWN_BUILTIN,
  sermon: SERMON_BUILTIN,
  overlay: OVERLAY_BUILTIN,
  announcement: ANNOUNCEMENT_BUILTIN,
}
