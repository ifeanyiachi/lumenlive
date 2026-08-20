// Type-first theme templates (themeredo.md, Phase 3). One seed `Theme` per
// `ThemeType`, each pre-loaded with exactly the placeholders its type requires so
// "New → <type>" opens the editor on the right builder. Pure: `id`/`now` are
// injected, never minted inline (matches the rest of `lib/theme/**`).

import type { Theme, ThemeType } from "@/types/theme"
import { scriptureTemplate } from "./scripture"
import { songTemplate } from "./song"
import { countdownTemplate } from "./countdown"
import { sermonTemplate } from "./sermon"
import { overlayTemplate } from "./overlay"
import { announcementTemplate } from "./announcement"

export {
  scriptureTemplate,
  songTemplate,
  countdownTemplate,
  sermonTemplate,
  overlayTemplate,
  announcementTemplate,
}

/** Every theme type, in canonical New-menu order. */
export const THEME_TYPES: readonly ThemeType[] = [
  "scripture",
  "song",
  "countdown",
  "sermon",
  "overlay",
  "announcement",
]

type TemplateFactory = (newId: () => string, now?: number) => Theme

const TEMPLATE_BY_TYPE: Record<ThemeType, TemplateFactory> = {
  scripture: scriptureTemplate,
  song: songTemplate,
  countdown: countdownTemplate,
  sermon: sermonTemplate,
  overlay: overlayTemplate,
  announcement: announcementTemplate,
}

/**
 * Build a fresh, editable (non-builtin) seed theme of the given type. The result
 * satisfies `validateTheme` out of the box — its required placeholders are seeded.
 */
export function createThemeFromTemplate(
  type: ThemeType,
  newId: () => string,
  now = 0
): Theme {
  return TEMPLATE_BY_TYPE[type](newId, now)
}
