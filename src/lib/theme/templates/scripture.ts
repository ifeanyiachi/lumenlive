import type { Theme } from "@/types/theme"
import { createTheme } from "../model"
import { scriptureEl } from "../builtins/_shared"

/**
 * Seed a fresh Scripture theme for the type-first New flow (themeredo.md,
 * Phase 3). A neutral starting canvas carrying only its required placeholder — a
 * `SlideScriptureElement` — which the pushed reference + verse text fill at
 * go-live. Decorate freely from here.
 */
export function scriptureTemplate(newId: () => string, now = 0): Theme {
  return createTheme(
    {
      name: "Scripture Theme",
      type: "scripture",
      elements: [
        scriptureEl(
          "scripture-placeholder",
          { x: 8, y: 16, width: 84, height: 68 },
          { fontSize: 56, referenceFontSize: 30 }
        ),
      ],
    },
    newId,
    now
  )
}
