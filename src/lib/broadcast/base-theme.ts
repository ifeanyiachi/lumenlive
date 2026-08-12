import type { BaseBackground, BroadcastTheme } from "@/types/broadcast"

/**
 * Resolve the central base background into a concrete `BroadcastTheme` for the
 * output to render (via `renderVerse(theme, null)`), so the output stays a single
 * theme-driven path regardless of the configured source:
 *
 * - `null` → the output's own theme (the default; each output keeps its theme).
 * - `{ kind: "theme" }` → that theme, with all its branding/elements.
 * - `{ kind: "background" }` → a synthesized theme that paints ONLY the given
 *   background (solid/gradient/image/video): no decorative elements, no text box.
 *   The output theme is used as the template so resolution/layout defaults match.
 *
 * Pure — shared by the store (delivery to the output) and the operator preview.
 */
export function resolveBaseTheme(
  baseBackground: BaseBackground | null | undefined,
  outputTheme: BroadcastTheme,
  themes: BroadcastTheme[]
): BroadcastTheme {
  if (!baseBackground) return outputTheme
  if (baseBackground.kind === "theme") {
    return themes.find((t) => t.id === baseBackground.themeId) ?? outputTheme
  }
  return {
    ...outputTheme,
    background: baseBackground.background,
    elements: [],
    layerOrder: [],
    textBox: { ...outputTheme.textBox, enabled: false },
  }
}
