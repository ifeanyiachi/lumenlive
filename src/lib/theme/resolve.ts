import type { CountdownTimer } from "@/types/alert"
import type { BaseBackground } from "@/types/broadcast"
import type { Theme } from "@/types/theme"
import { resolveLegacyThemeId } from "./migrate/legacy-id"
import { backgroundToSlide } from "./migrate/background"

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

/**
 * Resolve the Scripture {@link Theme} an output renders live verses with, from the
 * *new* typed theme store (themeredo.md, flip RF2 — the renderer Theme-object flip).
 *
 * An output's `themeId` still lives in the legacy namespace, so it is reconciled
 * through {@link resolveLegacyThemeId}: a stored id that points at a legacy built-in
 * is aliased to its new-built-in equivalent, while a preserved custom id (or an
 * already-new id) matches directly. Only a `scripture`-type theme qualifies (the
 * live verse look); a non-scripture reference yields `undefined` so the caller can
 * fall back to a scripture built-in.
 *
 * PURE: a plain lookup over the passed theme list.
 */
export function resolveScriptureTheme(
  themeId: string | undefined,
  themes: readonly Theme[]
): Theme | undefined {
  if (!themeId) return undefined
  const aliased = resolveLegacyThemeId(themeId)
  return themes.find(
    (t) => (t.id === themeId || t.id === aliased) && t.type === "scripture"
  )
}

/**
 * Resolve the Song {@link Theme} a schedule/song uses to generate lyric slides, from
 * the *new* typed theme store (themeredo.md, flip VR3) — the analogue of
 * `resolveScriptureTheme` for the `song` type. A stored `themeId` (a legacy `SlideTheme`
 * id) is reconciled through the alias; only a `song`-type theme qualifies. Returns
 * `undefined` for an unknown id so the caller can fall back (e.g. a plain background).
 *
 * PURE: a plain lookup over the passed theme list.
 */
export function resolveSongTheme(
  themeId: string | undefined,
  themes: readonly Theme[]
): Theme | undefined {
  if (!themeId) return undefined
  const aliased = resolveLegacyThemeId(themeId)
  return themes.find(
    (t) => (t.id === themeId || t.id === aliased) && t.type === "song"
  )
}

/**
 * Resolve the central base/master backdrop into a concrete {@link Theme} for the
 * output to paint behind Clear and transparent content (themeredo.md, flip RF3a /
 * decision D1) — the new-model analogue of `lib/broadcast/base-theme.ts`'s
 * `resolveBaseTheme` (which returned a `BroadcastTheme` painted via `renderVerse`).
 *
 * - `null` → the output's own theme (each output keeps its theme as its backdrop).
 * - `{ kind: "theme" }` → that theme, resolved through the legacy-id alias (any type —
 *   a backdrop can be any look), falling back to the output theme if unresolved.
 * - `{ kind: "background" }` → a synthesized background-only theme (no elements, no
 *   placeholder), the canvas `Background` converted to a `SlideBackground`. Given a
 *   distinct id so the compositor's "base differs from content" dedupe still fires.
 *
 * PURE — a plain lookup + structural build over the passed theme list.
 */
export function resolveBaseTheme(
  baseBackground: BaseBackground | null | undefined,
  outputTheme: Theme,
  themes: readonly Theme[]
): Theme {
  if (!baseBackground) return outputTheme
  if (baseBackground.kind === "theme") {
    const aliased = resolveLegacyThemeId(baseBackground.themeId)
    return (
      themes.find(
        (t) => t.id === baseBackground.themeId || t.id === aliased
      ) ?? outputTheme
    )
  }
  return {
    ...outputTheme,
    id: "base-background",
    name: "Base Background",
    background: backgroundToSlide(baseBackground.background),
    elements: [],
  }
}
