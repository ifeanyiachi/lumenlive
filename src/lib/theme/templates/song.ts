import type { Theme } from "@/types/theme"
import { createTheme } from "../model"
import { placeholderTextEl } from "../builtins/_shared"

/**
 * Seed a fresh Song/Lyrics theme (themeredo.md, Phase 3). Its required
 * placeholder is a `role:"lyrics"` text element, filled with the current lyric
 * lines at go-live.
 */
export function songTemplate(newId: () => string, now = 0): Theme {
  return createTheme(
    {
      name: "Song Theme",
      type: "song",
      background: { type: "solid", color: "#0b1020" },
      elements: [
        placeholderTextEl(
          "lyrics-placeholder",
          "lyrics",
          { x: 8, y: 20, width: 84, height: 60 },
          { fontSize: 60, fontWeight: 700, lineHeight: 1.3 }
        ),
      ],
    },
    newId,
    now
  )
}
