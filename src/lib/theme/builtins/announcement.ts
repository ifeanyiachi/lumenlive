import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { placeholderTextEl } from "./_shared"

/**
 * Built-in Announcement theme (themeredo.md, Phase 1). Title + body are authored
 * at build time into the `role:"title"` / `role:"body"` text placeholders.
 */
export const ANNOUNCEMENT_BUILTIN: Theme = {
  id: "builtin-announcement",
  name: "Announcement",
  type: "announcement",
  builtin: true,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { ...DEFAULT_THEME_RESOLUTION },
  background: {
    type: "gradient",
    gradient: {
      type: "linear",
      angle: 160,
      stops: [
        { offset: 0, color: "#7c2d12" },
        { offset: 1, color: "#1c1917" },
      ],
    },
  },
  elements: [
    placeholderTextEl(
      "announcement-title",
      "title",
      { x: 8, y: 16, width: 84, height: 20 },
      { text: "Announcement", fontSize: 76, fontWeight: 800 }
    ),
    placeholderTextEl(
      "announcement-body",
      "body",
      { x: 12, y: 42, width: 76, height: 44 },
      { text: "Details go here.", fontSize: 40, fontWeight: 400, lineHeight: 1.5 }
    ),
  ],
}
