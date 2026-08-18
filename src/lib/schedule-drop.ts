import { toast } from "sonner"
import { useScheduleStore } from "@/stores/schedule-store"
import { useQueueStore } from "@/stores"
import { addAssetsToSchedule } from "@/lib/schedule-media"
import { addSlideToSchedule } from "@/lib/schedule-slide"
import { addSongToSchedule } from "@/lib/schedule-song"
import type { DragPayload } from "@/stores/drag-store"
import type { ScriptureScheduleItem } from "@/types/schedule"

// Shared drop routing for the schedule panel — used by both the tab content drop
// zones and the tab triggers (dropping onto a trigger targets that tab). These
// operate on global store state (via `.getState()`), so they live at the lib
// layer alongside the other `schedule-*` drop helpers rather than in the
// component, mirroring `schedule-media` / `schedule-slide` / `schedule-song`.

export type VersesPayload = Extract<DragPayload, { kind: "verses" }>

export function addVersesToSchedule(
  { verses, translation, translationId }: VersesPayload,
  insertIndex?: number
) {
  const store = useScheduleStore.getState()
  const scheduleId = store.activeScheduleId
  if (!scheduleId) return
  const schedule = store.getActiveSchedule()
  let insertAt =
    insertIndex ??
    (store.activeItemIndex !== null
      ? store.activeItemIndex + 1
      : (schedule?.items.length ?? 0))
  let added = 0
  for (const verse of verses) {
    const item: ScriptureScheduleItem = {
      id: crypto.randomUUID(),
      type: "scripture",
      label: `${verse.book_name} ${verse.chapter}:${verse.verse} (${translation})`,
      order: insertAt,
      notes: "",
      translationId: translationId ?? verse.translation_id,
      bookNumber: verse.book_number,
      chapter: verse.chapter,
      verseStart: verse.verse,
      verseEnd: verse.verse,
      cachedReference: `${verse.book_name} ${verse.chapter}:${verse.verse} (${translation})`,
      cachedText: verse.text,
    }
    if (store.insertItemAt(scheduleId, item, insertAt)) {
      added++
      insertAt++
    }
  }
  const skipped = verses.length - added
  if (added === 0) {
    toast.info(
      skipped > 1
        ? "Those verses are already in the schedule"
        : "Already in the schedule"
    )
  } else {
    toast.success(
      `${added} verse${added > 1 ? "s" : ""} added to schedule` +
        (skipped > 0 ? ` · ${skipped} already there` : "")
    )
  }
}

// Routes a dropped payload (verses, media, slide, or song) into the active
// schedule. `insertIndex` targets the drop indicator's position; when omitted
// (e.g. dropping onto a tab trigger, which has no positional context) each
// handler falls back to inserting just after the active item.
export function handleScheduleDrop(p: DragPayload, insertIndex?: number) {
  if (p.kind === "verses") addVersesToSchedule(p, insertIndex)
  else if (p.kind === "media") addAssetsToSchedule(p.assets, true, insertIndex)
  else if (p.kind === "slide") addSlideToSchedule(p, insertIndex)
  else if (p.kind === "song") addSongToSchedule(p, insertIndex)
}

export function addVersesToQueue({ verses, translation }: VersesPayload) {
  const queueStore = useQueueStore.getState()
  for (const verse of verses) {
    queueStore.addItem({
      id: crypto.randomUUID(),
      verse,
      reference: `${verse.book_name} ${verse.chapter}:${verse.verse} (${translation})`,
      confidence: 1,
      source: "manual",
      added_at: Date.now(),
    })
  }
  toast.success(
    `${verses.length} verse${verses.length > 1 ? "s" : ""} added to queue`
  )
}
