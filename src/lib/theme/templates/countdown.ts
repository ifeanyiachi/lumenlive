import type { Theme } from "@/types/theme"
import { createTheme } from "../model"
import { textEl, timerEl } from "../builtins/_shared"

/**
 * Seed a fresh Countdown theme (themeredo.md, Phase 3). Its required placeholder
 * is a `SlideTimerElement` (the live ticking time); a heading above it is free
 * decoration the author can edit or remove.
 */
export function countdownTemplate(newId: () => string, now = 0): Theme {
  return createTheme(
    {
      name: "Countdown Theme",
      type: "countdown",
      background: { type: "solid", color: "#020617" },
      elements: [
        textEl(
          "countdown-heading",
          { x: 10, y: 28, width: 80, height: 16 },
          { text: "Starting soon", fontSize: 40, color: "#c7d2fe" }
        ),
        timerEl(
          "countdown-timer",
          { x: 10, y: 44, width: 80, height: 26 },
          { durationSeconds: 300, fontSize: 140, fontWeight: 800 }
        ),
      ],
    },
    newId,
    now
  )
}
