import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { placeholderTextEl } from "./_shared"

/**
 * Built-in Sermon theme (themeredo.md, Phase 1). Title + points are authored at
 * build time into the `role:"title"` / `role:"points"` text placeholders.
 */
export const SERMON_BUILTIN: Theme = {
  id: "builtin-sermon",
  name: "Sermon",
  type: "sermon",
  builtin: true,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { ...DEFAULT_THEME_RESOLUTION },
  background: { type: "solid", color: "#111827" },
  elements: [
    placeholderTextEl(
      "sermon-title",
      "title",
      { x: 8, y: 12, width: 84, height: 22 },
      {
        text: "Sermon Title",
        fontSize: 72,
        fontWeight: 800,
        horizontalAlign: "left",
        verticalAlign: "top",
      }
    ),
    placeholderTextEl(
      "sermon-points",
      "points",
      { x: 8, y: 38, width: 84, height: 52 },
      {
        text: "1. First point\n2. Second point\n3. Third point",
        fontSize: 40,
        fontWeight: 400,
        horizontalAlign: "left",
        verticalAlign: "top",
        lineHeight: 1.6,
        listType: "numbered",
      }
    ),
  ],
}
