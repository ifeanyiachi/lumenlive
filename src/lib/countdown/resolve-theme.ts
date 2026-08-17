import type { CountdownTimer } from "@/types/alert"
import type { BroadcastTheme } from "@/types/broadcast"

/**
 * The `countdown`-category theme a timer renders with, or `undefined` when the
 * timer is in custom mode (or the referenced theme is gone).
 *
 * Pure over the theme list so every surface that needs it resolves the *same*
 * theme from the *same* rule: the countdown store (emit side, shipping the theme
 * to the audience output) and the operator overlay preview both call this — they
 * cannot drift on which theme a timer paints with.
 */
export function resolveTimerTheme(
  timer: CountdownTimer,
  themes: BroadcastTheme[]
): BroadcastTheme | undefined {
  if (timer.styleMode !== "theme" || !timer.themeId) return undefined
  return themes.find(
    (t) => t.id === timer.themeId && t.category === "countdown"
  )
}
