import { useState, useRef } from "react"
import { PlayIcon, TrashIcon, SettingsIcon, ListPlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useScheduleStore } from "@/stores/schedule-store"
import { useQueueStore, useBibleStore } from "@/stores"
import { useDropZone } from "@/stores/drag-store"
import { presentQueueVerse, presentQueueVerseLive } from "@/hooks/use-broadcast"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { VerseEditModal } from "@/components/verse-edit/verse-edit-modal"
import { queueItemToScheduleItem } from "@/components/schedule/schedule-utils"
import { addVersesToQueue } from "@/lib/schedule-drop"
import type { QueueItem } from "@/types/queue"

export function AIVersesTab() {
  const items = useQueueStore((s) => s.items)
  const activeIndex = useQueueStore((s) => s.activeIndex)
  const highlightedId = useQueueStore((s) => s.highlightedId)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)
  const activeItemIndex = useScheduleStore((s) => s.activeItemIndex)
  const translations = useBibleStore((s) => s.translations)
  const [confirmClear, setConfirmClear] = useState(false)
  const [editVerse, setEditVerse] = useState<QueueItem | null>(null)

  const handlePresent = (item: QueueItem, index: number) => {
    presentQueueVerse(item, index)
  }

  const handlePresentLive = (item: QueueItem, index: number) => {
    presentQueueVerseLive(item, index)
  }

  const handleAddToSchedule = (item: QueueItem) => {
    if (!activeScheduleId) return
    const schedule = useScheduleStore.getState().getActiveSchedule()
    const insertIndex =
      activeItemIndex !== null
        ? activeItemIndex + 1
        : (schedule?.items.length ?? 0)
    const scheduleItem = queueItemToScheduleItem(item, insertIndex)
    const ok = useScheduleStore
      .getState()
      .insertItemAt(activeScheduleId, scheduleItem, insertIndex)
    if (ok) toast.success("Verse added to schedule")
    else toast.info("Already in the schedule")
  }

  const sourceBadge = (item: QueueItem) =>
    item.source === "manual" ? (
      <Badge variant="outline" className="shrink-0 text-[0.5rem]">
        Manual
      </Badge>
    ) : (
      <Badge
        variant="default"
        className="shrink-0 bg-ai-direct/15 text-[0.5rem] text-ai-direct hover:bg-ai-direct/15"
      >
        AI
      </Badge>
    )

  const dropZoneRef = useRef<HTMLDivElement>(null)
  const verseDragOver = useDropZone(dropZoneRef, {
    accepts: ["verses"],
    onDrop: (p) => {
      if (p.kind === "verses") addVersesToQueue(p)
    },
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <Badge variant="outline">{items.length}</Badge>
        {items.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-[0.625rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      <div
        ref={dropZoneRef}
        className={cn(
          "min-h-0 flex-1",
          verseDragOver && "bg-primary/5 ring-2 ring-primary/50 ring-inset"
        )}
      >
        <ScrollArea className="size-full">
          <div className="flex flex-col gap-0.5 p-1.5">
            {items.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                Verses will appear here when detected or queued
              </p>
            )}
            {items.map((item, idx) => (
              <div key={item.id} className="min-w-0 overflow-hidden">
                <div
                  className={cn(
                    "group flex h-10 cursor-pointer items-center gap-2 rounded-md px-2.5 transition-colors",
                    item.id === highlightedId
                      ? "animate-pulse border border-amber-500/40 bg-amber-500/15"
                      : idx === activeIndex
                        ? "border border-primary/30 bg-primary/10"
                        : "hover:bg-muted/50"
                  )}
                  onClick={() => handlePresent(item, idx)}
                  onDoubleClick={() => handlePresentLive(item, idx)}
                >
                  <span
                    className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                    title={item.reference}
                  >
                    {item.reference}
                  </span>

                  {sourceBadge(item)}

                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePresent(item, idx)
                      }}
                      title="Present"
                    >
                      <PlayIcon className="size-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddToSchedule(item)
                      }}
                      title="Add to schedule"
                      disabled={!activeScheduleId}
                    >
                      <ListPlusIcon className="size-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        useQueueStore.getState().removeItem(item.id)
                        toast("Verse removed")
                      }}
                      title="Remove"
                    >
                      <TrashIcon className="size-2.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditVerse(item)
                      }}
                      title="Edit verse formatting"
                    >
                      <SettingsIcon className="size-2.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all verses"
        description={`Remove all ${items.length} verse${
          items.length === 1 ? "" : "s"
        } from the queue? This cannot be undone.`}
        confirmLabel="Clear all"
        onConfirm={() => {
          useQueueStore.getState().clearQueue()
          toast("Queue cleared")
        }}
      />

      {editVerse && (
        <VerseEditModal
          open
          onOpenChange={(open) => {
            if (!open) setEditVerse(null)
          }}
          verse={editVerse.verse}
          translationId={editVerse.verse.translation_id}
          translationAbbreviation={
            translations.find((t) => t.id === editVerse.verse.translation_id)
              ?.abbreviation ?? "KJV"
          }
        />
      )}
    </div>
  )
}
