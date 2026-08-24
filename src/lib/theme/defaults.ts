/**
 * App-wide "default theme" reconciliation for the type-first model.
 *
 * A theme's type is intrinsic, but only some types carry an app-wide *default* —
 * the look new outputs (scripture) or generated song slides adopt when nothing
 * more specific is chosen. Those defaults live in two separate settings
 * locations: scripture in a top-level `scriptureDefaultThemeId` field, song
 * nested at `songSlideDefaults.themeId`. This module centralizes which types are
 * defaultable and how to read the current default id, so the library, the
 * designer, and the song projection dropdown don't each hardcode the two
 * storage shapes.
 */

import type { ThemeType } from "@/types/theme"
import type { SongSlideOptions } from "@/types/song"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"

/** The settings values that hold the per-type theme defaults. */
export interface ThemeDefaultSettings {
  scriptureDefaultThemeId: string
  songSlideDefaults: Pick<SongSlideOptions, "themeId">
}

/**
 * The theme types a user can "set as default" (the look new scripture outputs /
 * generated song slides adopt). The other intrinsic types are chosen per use and
 * have no persisted default.
 */
export const DEFAULTABLE_THEME_TYPES = [
  "scripture",
  "song",
] as const satisfies readonly ThemeType[]

/** Whether `type` carries an app-wide default that can be set from the library. */
export function isDefaultableThemeType(type: ThemeType): boolean {
  return (DEFAULTABLE_THEME_TYPES as readonly ThemeType[]).includes(type)
}

/**
 * The currently-stored default theme id for a defaultable type, or `null` for a
 * type with no default concept. The id is reconciled through the legacy-id alias
 * so a stored built-in id still matches a theme in the merged registry.
 */
export function currentDefaultThemeId(
  type: ThemeType,
  settings: ThemeDefaultSettings
): string | null {
  switch (type) {
    case "scripture":
      return resolveLegacyThemeId(settings.scriptureDefaultThemeId)
    case "song":
      return resolveLegacyThemeId(settings.songSlideDefaults.themeId)
    default:
      return null
  }
}
