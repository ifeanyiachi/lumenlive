import type { BaseBackground } from "@/types/broadcast"
import type { Slide } from "@/types/slide"
import type { Theme } from "@/types/theme"
import { resolveScriptureTheme, resolveBaseTheme } from "@/lib/theme/resolve"
import { themeToSlide } from "./theme-to-slide"
import { stripThemeContent } from "./strip-content"

/**
 * Build the central base/master backdrop as a renderable {@link Slide} — the
 * background + branding shown on Clear and behind idle/transparent content, with
 * NO live content.
 *
 * This is the operator-preview analogue of the projector emit path
 * (`stores/broadcast/sync.ts`), and must stay in lockstep with it: resolve the
 * output's scripture theme (falling back to the first scripture built-in), resolve
 * the configured base backdrop over it, then **content-strip** so the theme's
 * authoring sample text ("John 3:16", a sermon title, …) never reaches the screen.
 * Skipping the strip is the bug this helper exists to prevent — a backdrop is not
 * live content.
 *
 * Returns `null` only when no scripture theme resolves at all (no fallback
 * available). `newId`/`now` are injected for determinism (matching `themeToSlide`).
 *
 * PURE: a lookup + structural build over the passed theme list; no React/store.
 */
export function buildBaseBackdropSlide(
  themeId: string | undefined,
  baseBackground: BaseBackground | null,
  themes: readonly Theme[],
  newId: () => string,
  now = 0
): Slide | null {
  const outputTheme =
    resolveScriptureTheme(themeId, themes) ??
    themes.find((t) => t.type === "scripture")
  if (!outputTheme) return null
  const base = stripThemeContent(
    resolveBaseTheme(baseBackground, outputTheme, themes)
  )
  return themeToSlide(base, newId, now)
}
