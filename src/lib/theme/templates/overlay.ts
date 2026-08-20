import type { Theme } from "@/types/theme"
import { createTheme } from "../model"
import { placeholderTextEl, shapeEl } from "../builtins/_shared"

/**
 * Seed a fresh Overlay / Lower-third theme (themeredo.md, Phase 3). Its only hard
 * requirement is a **transparent background** so it composites over live output;
 * the seeded lower-third bar and title are editable decoration.
 */
export function overlayTemplate(newId: () => string, now = 0): Theme {
  return createTheme(
    {
      name: "Overlay Theme",
      type: "overlay",
      background: { type: "transparent" },
      elements: [
        shapeEl(
          "lower-third-bar",
          { x: 6, y: 74, width: 60, height: 14 },
          { fillColor: "rgba(2,6,23,0.72)", borderRadius: 8 }
        ),
        placeholderTextEl(
          "title-placeholder",
          "title",
          { x: 9, y: 75, width: 54, height: 12 },
          {
            text: "Lower Third",
            fontSize: 40,
            fontWeight: 700,
            horizontalAlign: "left",
          }
        ),
      ],
    },
    newId,
    now
  )
}
