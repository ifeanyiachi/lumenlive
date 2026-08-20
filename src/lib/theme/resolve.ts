import type { CountdownTimer } from "@/types/alert"
import type { Theme } from "@/types/theme"
import { resolveLegacyThemeId } from "./migrate/legacy-id"

/**
 * Resolve the Countdown {@link Theme} a timer renders with, from the *new* typed
 * theme store (themeredo.md, flip F2). The new-model analogue of
 * `lib/countdown/resolve-theme.ts`'s `resolveTimerTheme` (which resolved a
 * `BroadcastTheme`); the live countdown flip (F3) swaps to this so every surface
 * — the emit side and the operator overlay preview — resolves the same `Theme`
 * from the same rule and cannot drift.
 *
 * `themeId` is reconciled through {@link resolveLegacyThemeId}: a stored id that
 * still points at a legacy built-in is aliased to its new-built-in equivalent,
 * while a preserved custom id (or an already-new id) matches directly. Returns
 * `undefined` for custom-styled timers or a dangling / wrong-type reference.
 *
 * PURE: a plain lookup over the passed theme list.
 */
export function resolveCountdownTheme(
  timer: CountdownTimer,
  themes: readonly Theme[]
): Theme | undefined {
  if (timer.styleMode !== "theme" || !timer.themeId) return undefined
  const aliased = resolveLegacyThemeId(timer.themeId)
  return themes.find(
    (t) =>
      (t.id === timer.themeId || t.id === aliased) && t.type === "countdown"
  )
}
