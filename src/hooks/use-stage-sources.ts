import { useEffect } from "react"
import {
  useBroadcastStore,
  useAlertStore,
  useCountdownStore,
  useScheduleStore,
} from "@/stores"

/**
 * Bridges the existing operator feeds into the stage-display source fields so
 * stage zones (Phase 4) render live without their own control surface:
 *
 * - active alert  → Stage Message zone
 * - active countdown → Timer zone
 * - the live schedule's upcoming items → Playlist zone
 *
 * The Announcement zone has no automatic feed; it's driven directly via
 * `setStageAnnouncement`. Mounted once in `App`. Each mapping only pushes when
 * its derived value actually changes, so we don't re-emit to the stage output
 * on every unrelated render.
 */
export function useStageSources() {
  const activeAlerts = useAlertStore((s) => s.activeAlerts)
  const activeCountdowns = useCountdownStore((s) => s.activeCountdowns)
  const timers = useCountdownStore((s) => s.timers)
  const schedules = useScheduleStore((s) => s.schedules)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)
  const activeItemIndex = useScheduleStore((s) => s.activeItemIndex)

  // Latest alert wins as the stage message.
  const message = activeAlerts.length
    ? activeAlerts[activeAlerts.length - 1].message
    : null
  useEffect(() => {
    useBroadcastStore.getState().setStageMessage(message)
  }, [message])

  // Most-recent active countdown feeds the timer. endsAt is derived from the
  // start + duration; a paused countdown isn't frozen (documented limitation).
  const cd = activeCountdowns.length
    ? activeCountdowns[activeCountdowns.length - 1]
    : null
  const timerLabel = cd
    ? (timers.find((t) => t.id === cd.timerId)?.label ?? "Timer")
    : ""
  const endsAt = cd ? cd.startedAt + cd.durationSeconds * 1000 : null
  useEffect(() => {
    useBroadcastStore
      .getState()
      .setStageTimer(endsAt != null ? { label: timerLabel, endsAt } : null)
  }, [endsAt, timerLabel])

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
