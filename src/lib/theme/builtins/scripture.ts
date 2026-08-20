import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { scriptureEl } from "./_shared"

/**
 * Built-in Scripture theme (themeredo.md, Phase 1). Its scripture placeholder is
 * filled with the pushed reference + verse text at go-live.
 */
export const SCRIPTURE_BUILTIN: Theme = {
  id: "builtin-scripture",
  name: "Scripture",
  type: "scripture",
  builtin: true,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { ...DEFAULT_THEME_RESOLUTION },
  background: {
    type: "gradient",
    gradient: {
      type: "linear",
      angle: 135,
      stops: [
        { offset: 0, color: "#0f172a" },
        { offset: 1, color: "#1e293b" },
      ],
    },
  },
  elements: [
    scriptureEl(
      "scripture-placeholder",
      { x: 10, y: 18, width: 80, height: 64 },
      {
        fontSize: 44,
        lineHeight: 1.5,
        referenceFontSize: 26,
        referenceColor: "#94a3b8",
        // Sample content so the placeholder shows while authoring; replaced by the
        // pushed reference + verse at go-live.
        reference: "John 3:16",
        verseText:
          "For God so loved the world, that he gave his only begotten Son.",
        translation: "KJV",
      }
    ),
  ],
}
