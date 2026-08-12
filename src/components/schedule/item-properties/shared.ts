import { useBroadcastStore } from "@/stores/broadcast-store"
import { useScheduleStore } from "@/stores/schedule-store"
import { useMediaStore } from "@/stores/media-store"
import type { MediaEndAction, MediaScheduleItem } from "@/types/schedule"

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
  // An item counts as live only when its media is what's actually on the
  // audience (committed via a take). Presenting only stages into the Program
  // preview, and the schedule cursor tracks that *previewed* item — which may
  // differ from what's live — so we match on the live media identity rather than
  // the cursor. Otherwise a fit edit could land on a different, already-live
  // media. Edits still save to the schedule item and apply when next presented.
  if (bs.broadcastSource !== "schedule" || !bs.liveMedia) return false
  const item = useScheduleStore
    .getState()
    .getActiveSchedule()
    ?.items.find((i) => i.id === itemId)
  if (!item || item.type !== "media") return false
  const mi = item as MediaScheduleItem
  const asset = useMediaStore
    .getState()
    .assets.find((a) => a.id === mi.mediaAssetId)
  const filePath = asset?.filePath ?? mi.cachedFilePath
  return !!filePath && filePath === bs.liveMedia.filePath
}
