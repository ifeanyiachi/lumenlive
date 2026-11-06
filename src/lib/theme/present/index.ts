// The presentation layer (themeredo.md, Phase 4) — one mapper per theme type,
// `(theme, content) → PresentedSlide[]`. Pure: no React/Zustand/Tauri; the
// caller injects `newId`/`now` and the source theme is never mutated.

import type { Theme } from "@/types/theme"
import { presentScripture, presentScripturePages } from "./scripture"
import { presentSong } from "./song"
import { presentCountdown } from "./countdown"
import { presentSermon } from "./sermon"
import { presentOverlay } from "./overlay"
import { presentAnnouncement } from "./announcement"
import type { PresentContent, PresentedSlide } from "./types"

export type {
  PresentContent,
  PresentedSlide,
  ContentForType,
  ScriptureContent,
  SongContent,
  CountdownContent,
  SermonContent,
  OverlayContent,
  AnnouncementContent,
} from "./types"

export {
  presentScripture,
  presentScripturePages,
  presentSong,
  presentCountdown,
  presentSermon,
  presentOverlay,
  presentAnnouncement,
}

/**
 * Present any theme with its matching content, dispatching on the theme's
 * intrinsic type. Throws if `content.type` does not match `theme.type` — the two
 * are coupled by construction (a scripture theme takes scripture content), and a
 * mismatch is a programming error, not a recoverable state.
 */
export function presentTheme(
  theme: Theme,
  content: PresentContent,
  newId: () => string,
  now = 0
): PresentedSlide[] {
  if (content.type !== theme.type) {
    throw new Error(
      `present: content type "${content.type}" does not match theme type "${theme.type}"`
    )
  }
  switch (content.type) {
    case "scripture":
      return presentScripture(theme, content, newId, now)
    case "song":
      return presentSong(theme, content, newId, now)
    case "countdown":
      return presentCountdown(theme, content, newId, now)
    case "sermon":
      return presentSermon(theme, content, newId, now)
    case "overlay":
      return presentOverlay(theme, content, newId, now)
    case "announcement":
      return presentAnnouncement(theme, content, newId, now)
  }
}
