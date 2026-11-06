import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { shapeEl, textEl } from "./_shared"

/**
 * Built-in Overlay / lower-third theme (themeredo.md, Phase 1). The background is
 * transparent so it composites over the live output; its elements are free-form
 * (here a lower-third bar with a title + subtitle).
 */
export const OVERLAY_BUILTIN: Theme = {
  id: "builtin-overlay",
  name: "Lower Third",
  type: "overlay",
  builtin: true,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { ...DEFAULT_THEME_RESOLUTION },
  background: { type: "transparent" },
  elements: [
    shapeEl(
      "overlay-bar",
      { x: 6, y: 72, width: 60, height: 18 },
      { fillColor: "rgba(2,6,23,0.72)", borderRadius: 8 }
    ),
    textEl(
      "overlay-title",
      { x: 9, y: 73, width: 54, height: 9 },
      {
        text: "Title",
        fontSize: 40,
        fontWeight: 700,
        horizontalAlign: "left",
        verticalAlign: "middle",
      }
    ),
    textEl(
      "overlay-subtitle",
      { x: 9, y: 82, width: 54, height: 7 },
      {
        text: "Subtitle",
        fontSize: 26,
        fontWeight: 400,
        color: "#cbd5e1",
        horizontalAlign: "left",
        verticalAlign: "middle",
      }
    ),
  ],
}
