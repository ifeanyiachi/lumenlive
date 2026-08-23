import type { SlideElement } from "@/types/slide"
import type { Theme } from "@/types/theme"

/**
 * Empty the *authoring sample* content baked into a theme's placeholder elements,
 * leaving styling and decoration intact.
 *
 * Built-in themes ship sample text so the placeholder is visible while authoring —
 * the Scripture theme's "John 3:16", a Sermon theme's title, a Countdown's static
 * duration. That sample is fine on the live path (the presentation mappers in
 * `lib/theme/present` fill placeholders from pushed content), but the **idle
 * backdrop** and the **Clear / base backdrop** render the theme with nothing
 * pushed. Without this strip the sample leaks onto the audience screen the moment a
 * broadcast output (external display / NDI) is enabled, even though nothing is live.
 *
 * - `scripture` → reference/verseText/translation cleared (element renders empty).
 * - `text` with a placeholder `role` → text cleared. Roleless text is fixed
 *   decoration authored into the backdrop, so it is kept.
 * - `timer` → dropped: a live countdown is content, meaningless on an idle backdrop.
 * - everything else (shapes, images, videos) → kept as decoration.
 *
 * PURE: returns a new array; only changed elements are shallow-copied.
 */
export function stripPlaceholderContent(
  elements: readonly SlideElement[]
): SlideElement[] {
  const out: SlideElement[] = []
  for (const el of elements) {
    switch (el.type) {
      case "scripture":
        out.push({ ...el, reference: "", verseText: "", translation: "" })
        break
      case "text":
        // Roled text is a go-live placeholder (lyrics/title/points/body); blank
        // its sample. Roleless text is fixed decoration — keep it.
        out.push(el.role ? { ...el, text: "" } : el)
        break
      case "timer":
        // No live countdown on an idle / base backdrop — omit it entirely.
        break
      default:
        out.push(el)
    }
  }
  return out
}

/** {@link stripPlaceholderContent} lifted to a whole {@link Theme}. */
export function stripThemeContent(theme: Theme): Theme {
  return { ...theme, elements: stripPlaceholderContent(theme.elements) }
}
