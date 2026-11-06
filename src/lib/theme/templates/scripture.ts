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
          {
            fontSize: 56,
            referenceFontSize: 30,
            // Sample content so the placeholder is visible while authoring; the
            // pushed reference + verse replace it at go-live.
            reference: "John 3:16",
            verseText:
              "For God so loved the world, that he gave his only begotten Son.",
            translation: "KJV",
            // Verse numbers on by default (superscript markers before each verse).
            verseNumbers: {
              visible: true,
              fontSize: 28,
              color: "#94a3b8",
              superscript: true,
            },
          }
        ),
      ],
    },
    newId,
    now
  )
}
