import type { Theme } from "@/types/theme"
import { createTheme } from "../model"
import { placeholderTextEl } from "../builtins/_shared"

/**
 * Seed a fresh Announcement theme (themeredo.md, Phase 3). Requires a
 * `role:"title"` and a `role:"body"` text placeholder, both authored at build
 * time.
 */
export function announcementTemplate(newId: () => string, now = 0): Theme {
  return createTheme(
    {
      name: "Announcement Theme",
      type: "announcement",
      background: { type: "solid", color: "#111827" },
      elements: [
        placeholderTextEl(
          "title-placeholder",
          "title",
          { x: 8, y: 22, width: 84, height: 18 },
          { text: "Announcement", fontSize: 64, fontWeight: 800 }
        ),
        placeholderTextEl(
          "body-placeholder",
          "body",
          { x: 8, y: 46, width: 84, height: 36 },
          { text: "Details", fontSize: 40, fontWeight: 400, lineHeight: 1.4 }
        ),
      ],
    },
    newId,
    now
  )
}
