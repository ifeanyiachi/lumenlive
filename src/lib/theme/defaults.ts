/**
 * App-wide "default theme" reconciliation for the type-first model.
 *
 * Scripture and song keep their existing settings locations. The other four
 * types share a persisted map of default theme ids.
 */

import type { ThemeType } from "@/types/theme"
import type { SongSlideOptions } from "@/types/song"
import { resolveLegacyThemeId } from "@/lib/theme/migrate/legacy-id"
import { BUILTIN_THEME_BY_TYPE } from "@/lib/theme/builtins"

export type OtherDefaultThemeType = Exclude<ThemeType, "scripture" | "song">

/** The settings values that hold the per-type theme defaults. */
export interface ThemeDefaultSettings {
  scriptureDefaultThemeId: string
  songSlideDefaults: Pick<SongSlideOptions, "themeId">
  otherThemeDefaultIds: Record<OtherDefaultThemeType, string>
}

/**
 * Every intrinsic theme type can have one app-wide default.
 */
export const DEFAULTABLE_THEME_TYPES = [
  "scripture",
  "song",
  "countdown",
  "sermon",
  "overlay",
  "announcement",
] as const satisfies readonly ThemeType[]

/** Whether `type` carries an app-wide default that can be set from the library. */
export function isDefaultableThemeType(type: ThemeType): boolean {
  return (DEFAULTABLE_THEME_TYPES as readonly ThemeType[]).includes(type)
}

/**
 * The currently-stored default theme id, reconciled through legacy aliases.
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
      return resolveLegacyThemeId(
        settings.otherThemeDefaultIds[type] ?? BUILTIN_THEME_BY_TYPE[type].id
      )
  }
}
