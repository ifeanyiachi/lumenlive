import { useEffect } from "react"
import {
  useBroadcastStore,
  useCountdownStore,
  useScheduleStore,
} from "@/stores"
import type { StageTimer } from "@/lib/stage-display-renderer"

/**
 * Bridges the existing operator feeds into the stage-display source fields so
 * stage zones render live without their own control surface:
 *
 * - active countdown → Timer zone
 * - the live schedule's upcoming items → Playlist zone
 *
 * The Stage Message and Announcement zones are driven directly by the operator,
 * per monitor (`setStageCue`, see StageMonitorControls), and are intentionally
 * NOT wired to the audience alert feed — they are private to the stage monitor.
 * Mounted once in `App`. Each mapping only pushes when its
 * derived value actually changes, so we don't re-emit on every unrelated render.
 */
export function useStageSources() {
  const activeCountdowns = useCountdownStore((s) => s.activeCountdowns)
  const timers = useCountdownStore((s) => s.timers)
  const schedules = useScheduleStore((s) => s.schedules)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)
  const activeItemIndex = useScheduleStore((s) => s.activeItemIndex)

  // Most-recent active countdown feeds the timer. We push the raw countdown +
  // its timer config; the stage renderer derives the remaining time from the
  // SAME shared math as the operator preview (so pause freezes it, clock-mode
  // counts to its target, and format/colour match). The stage output re-derives
  // per second on its own tick, so we only push when the countdown identity or
  // state (start/pause/resume/adjust) actually changes — not every second.
  const cd = activeCountdowns.length
    ? activeCountdowns[activeCountdowns.length - 1]
    : null
  const cdTimer = cd ? timers.find((t) => t.id === cd.timerId) : undefined
  const stageTimer: StageTimer | null =
    cd && cdTimer ? { countdown: cd, timer: cdTimer } : null
  const timerKey = stageTimer ? JSON.stringify(stageTimer) : ""
  useEffect(() => {
    useBroadcastStore.getState().setStageTimer(stageTimer)
    // stageTimer is rederived each render; timerKey captures its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerKey])

  // Upcoming schedule items (after the live one) become the playlist.
  const schedule = schedules.find((s) => s.id === activeScheduleId)
  const upcoming =
    schedule && activeItemIndex != null
      ? schedule.items.slice(activeItemIndex + 1).map((i) => i.label)
      : []
  const playlistKey = upcoming.join("|")
  useEffect(() => {
    useBroadcastStore
      .getState()
      .setStagePlaylist(upcoming.length ? upcoming : null)
    // upcoming is rederived each render; playlistKey captures its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistKey])
}
