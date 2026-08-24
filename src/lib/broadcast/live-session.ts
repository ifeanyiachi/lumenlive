import type { VerseRenderData } from "@/types"
import type { LiveMedia, LiveWeb } from "@/types/broadcast"
import type { Slide } from "@/types/slide"
import type { BroadcastSource } from "@/stores/broadcast/types"

/**
 * Persisted "live session" — what the audience is currently seeing plus the
 * on-air flag — so a control-panel reload mid-service can restore the operator's
 * place instead of dropping the show.
 *
 * The whole live-transport slice is in-memory by default; only this subset is
 * durable. It includes the audience-visibility holds (`blackout` /
 * `clearForeground` / `showLogo`): those are NOT restored on a cold launch (the
 * original "never come back mysteriously black" rule), but `buildLiveSessionPatch`
 * is gated on an output window still being open — a mid-broadcast reload — where
 * that window is still holding black/clear/logo, so restoring the panel to match
 * removes a desync rather than creating a surprise.
 *
 * Deliberately EXCLUDED:
 *  - `preview*` — staging is transient by design (nothing reaches the audience
 *    without an explicit take),
 *  - `mediaTransport` / `webTransport` — playback position can't be meaningfully
 *    resumed; the output window that kept playing owns the true position.
 *
 * Kept as a structural type (not `Pick<BroadcastState>`) so this module stays in
 * the pure `lib/` layer without importing the Zustand store — the store's state
 * satisfies it structurally, exactly like `lib/broadcast/persistence.ts`.
 */
export interface LiveSessionData {
  isLive: boolean
  liveVerse: VerseRenderData | null
  liveVersePages: VerseRenderData[] | null
  liveVersePageIndex: number
  liveSlide: Slide | null
  liveMedia: LiveMedia | null
  liveWeb: LiveWeb | null
  broadcastSource: BroadcastSource
  interlinearText: string | null
  broadcastMuted: boolean
  blackout: boolean
  clearForeground: boolean
  showLogo: boolean
}

/** Extract the durable live-session subset from the full broadcast state. */
export function pickLiveSession(state: LiveSessionData): LiveSessionData {
  return {
    isLive: state.isLive,
    liveVerse: state.liveVerse,
    liveVersePages: state.liveVersePages,
    liveVersePageIndex: state.liveVersePageIndex,
    liveSlide: state.liveSlide,
    liveMedia: state.liveMedia,
    liveWeb: state.liveWeb,
    broadcastSource: state.broadcastSource,
    interlinearText: state.interlinearText,
    broadcastMuted: state.broadcastMuted,
    blackout: state.blackout,
    clearForeground: state.clearForeground,
    showLogo: state.showLogo,
  }
}

/** Whether any persisted live-session field differs between two states. */
export function liveSessionChanged(
  a: LiveSessionData,
  b: LiveSessionData
): boolean {
  return (
    a.isLive !== b.isLive ||
    a.liveVerse !== b.liveVerse ||
    a.liveVersePages !== b.liveVersePages ||
    a.liveVersePageIndex !== b.liveVersePageIndex ||
    a.liveSlide !== b.liveSlide ||
    a.liveMedia !== b.liveMedia ||
    a.liveWeb !== b.liveWeb ||
    a.broadcastSource !== b.broadcastSource ||
    a.interlinearText !== b.interlinearText ||
    a.broadcastMuted !== b.broadcastMuted ||
    a.blackout !== b.blackout ||
    a.clearForeground !== b.clearForeground ||
    a.showLogo !== b.showLogo
  )
}

/**
 * Turn raw persisted session data into a state patch — but only when it is safe
 * to resume, which is exactly when BOTH hold:
 *
 *  - `windowsOpen` — at least one broadcast output window is currently open. This
 *    distinguishes a control-panel reload *during* a live broadcast (the output
 *    windows survive the reload and keep painting) from a cold app launch (no
 *    output windows), where resuming would falsely mark the app on-air and
 *    resurrect a stale verse.
 *  - `raw.isLive` — the persisted session was actually on-air.
 *
 * When either is false this returns `null`: the caller leaves the store at its
 * clean defaults. The restore never emits to the output windows — they already
 * hold the content; this only re-syncs the control panel's own state.
 *
 * Pure and defensive: a corrupt/partial `raw` yields `null` rather than throwing.
 */
export function buildLiveSessionPatch(
  raw: Partial<LiveSessionData> | null | undefined,
  windowsOpen: boolean
): LiveSessionData | null {
  if (!raw || !windowsOpen || raw.isLive !== true) return null

  return {
    isLive: true,
    liveVerse: raw.liveVerse ?? null,
    liveVersePages: raw.liveVersePages ?? null,
    liveVersePageIndex:
      typeof raw.liveVersePageIndex === "number" ? raw.liveVersePageIndex : 0,
    liveSlide: raw.liveSlide ?? null,
    liveMedia: raw.liveMedia ?? null,
    liveWeb: raw.liveWeb ?? null,
    broadcastSource: raw.broadcastSource ?? null,
    interlinearText: raw.interlinearText ?? null,
    broadcastMuted: raw.broadcastMuted === true,
    blackout: raw.blackout === true,
    clearForeground: raw.clearForeground === true,
    showLogo: raw.showLogo === true,
  }
}
