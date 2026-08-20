import type { Theme } from "@/types/theme"
import { DEFAULT_THEME_RESOLUTION } from "../model"
import { textEl, timerEl } from "./_shared"

/**
 * Built-in Countdown theme (themeredo.md, Phase 2).
 *
 * The live ticking time renders through a dedicated `SlideTimerElement` — the
 * Countdown type's required placeholder (see `REQUIRED_PLACEHOLDERS`) — decorated
 * with a heading above it.
 */
export const COUNTDOWN_BUILTIN: Theme = {
  id: "builtin-countdown",
  name: "Countdown",
  type: "countdown",
  builtin: true,
  pinned: false,
  createdAt: 0,
  updatedAt: 0,
  resolution: { ...DEFAULT_THEME_RESOLUTION },
  background: {
    type: "gradient",
    gradient: {
      type: "radial",
      stops: [
        { offset: 0, color: "#1e1b4b" },
        { offset: 1, color: "#020617" },
      ],
    },
  },
  elements: [
    textEl(
      "countdown-heading",
      { x: 10, y: 26, width: 80, height: 16 },
      { text: "Service starts in", fontSize: 40, color: "#c7d2fe" }
    ),
    timerEl(
      "countdown-timer",
      { x: 10, y: 42, width: 80, height: 26 },
      { durationSeconds: 600, fontSize: 140, fontWeight: 800 }
    ),
  ],
}
