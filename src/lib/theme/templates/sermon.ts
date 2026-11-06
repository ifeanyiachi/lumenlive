import type { Theme } from "@/types/theme"
import { createTheme } from "../model"
import { placeholderTextEl } from "../builtins/_shared"

/**
 * Seed a fresh Sermon theme (themeredo.md, Phase 3). Requires a `role:"title"`
 * and a `role:"points"` text placeholder, both authored at build time.
 */
export function sermonTemplate(newId: () => string, now = 0): Theme {
  return createTheme(
    {
      name: "Sermon Theme",
      type: "sermon",
      background: { type: "solid", color: "#0f172a" },
      elements: [
        placeholderTextEl(
          "title-placeholder",
          "title",
          { x: 8, y: 14, width: 84, height: 18 },
          { text: "Sermon Title", fontSize: 64, fontWeight: 800 }
        ),
        placeholderTextEl(
          "points-placeholder",
          "points",
          { x: 8, y: 38, width: 84, height: 48 },
          {
            text: "Key points",
            fontSize: 44,
            fontWeight: 500,
            horizontalAlign: "left",
            verticalAlign: "top",
            lineHeight: 1.5,
          }
        ),
      ],
    },
    newId,
    now
  )
}
