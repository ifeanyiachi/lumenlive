import { useBroadcastStore } from "@/stores/broadcast-store"
import { useScheduleStore } from "@/stores/schedule-store"
import type { MediaEndAction } from "@/types/schedule"

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

export const END_ACTIONS: { value: MediaEndAction; label: string }[] = [
  { value: "hold", label: "Hold last frame" },
  { value: "loop", label: "Loop" },
  { value: "stop", label: "Stop (black)" },
  { value: "next", label: "Advance to next" },
]

export function isScheduleItemLive(itemId: string): boolean {
  const bs = useBroadcastStore.getState()
  // While locked the schedule cursor tracks the *previewed* item, not what's on
  // air, so no item counts as live for the purpose of pushing fit changes —
  // otherwise an edit could land on the frozen audience media. Edits still save
  // to the schedule item and take effect when it's next presented.
  if (bs.liveLocked) return false
  if (bs.broadcastSource !== "schedule" || !bs.liveMedia) return false
  const ss = useScheduleStore.getState()
  const idx = ss.activeItemIndex
  if (idx == null) return false
  return ss.getActiveSchedule()?.items[idx]?.id === itemId
}
