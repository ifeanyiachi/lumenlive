import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { BUILTIN_SLIDE_THEMES } from "@/lib/slide-themes"
import type { BroadcastTheme } from "@/types/broadcast"
import type { SlideTheme } from "@/types/slide"
import type { UnifiedTheme } from "@/types/theme"
import { broadcastThemeToUnified, slideThemeToUnified } from "./convert"

/**
 * All built-in themes — verse (broadcast) + slide/song — lifted into one unified
 * list (theme-unification-plan.md, Phase 1). This is the single catalog the
 * Phase 2 designer library and pickers will read, so song themes finally appear
 * alongside verse themes.
 */
export const BUILTIN_UNIFIED_THEMES: UnifiedTheme[] = [
  ...BUILTIN_THEMES.map(broadcastThemeToUnified),
  ...BUILTIN_SLIDE_THEMES.map(slideThemeToUnified),
]

/**
 * Build the full unified registry: the built-in verse + slide themes plus the
 * user's custom broadcast themes (from broadcast-store) and custom slide/song
 * themes (from presentation-store, authored via the slide editor in Phase 3).
 *
 * Pure: the caller passes the current custom themes; nothing here reads a store.
 */
export function buildUnifiedRegistry(
  customBroadcastThemes: BroadcastTheme[],
  customSlideThemes: SlideTheme[] = []
): UnifiedTheme[] {
  return [
    ...BUILTIN_UNIFIED_THEMES,
    ...customBroadcastThemes.map(broadcastThemeToUnified),
    ...customSlideThemes.map(slideThemeToUnified),
  ]
}
