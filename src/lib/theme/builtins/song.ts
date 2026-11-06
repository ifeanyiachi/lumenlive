import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { placeholderTextEl } from "./_shared"

/**
 * Built-in Song/Lyrics theme (themeredo.md, Phase 1). The `role:"lyrics"` text
 * placeholder is filled with the current lyric lines at go-live.
 */
export const SONG_BUILTIN: Theme = {
  id: "builtin-song",
  name: "Song",
  type: "song",
  builtin: true,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { ...DEFAULT_THEME_RESOLUTION },
  background: { type: "solid", color: "#0b1020" },
  elements: [
    placeholderTextEl(
      "lyrics-placeholder",
      "lyrics",
      { x: 8, y: 20, width: 84, height: 60 },
      {
        // Sample lyric so the placeholder shows while authoring; replaced by the
        // current lyric lines at go-live.
        text: "Verse lyrics here",
        fontSize: 60,
        fontWeight: 700,
        lineHeight: 1.3,
        shadow: { offsetX: 0, offsetY: 2, blur: 12, color: "rgba(0,0,0,0.6)" },
      }
    ),
  ],
}
