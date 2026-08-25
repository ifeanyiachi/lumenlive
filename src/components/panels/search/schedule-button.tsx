import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CalendarPlusIcon, CheckIcon } from "lucide-react"
import { useScheduleStore } from "@/stores/schedule-store"
import { buildScriptureScheduleItem } from "@/lib/search/schedule-items"
import { toast } from "sonner"
import type { Verse } from "@/types"

/**
 * Insert position for a new running-order item: right after the active item when
 * one is playing, otherwise appended to the end. Shared by the add path and the
 * probe used to locate an existing duplicate.
 */
function insertPosition(): number {
  const store = useScheduleStore.getState()
  const schedule = store.getActiveSchedule()
  return store.activeItemIndex !== null
    ? store.activeItemIndex + 1
    : (schedule?.items.length ?? 0)
}

/**
 * Flash the matching schedule item and scroll it into view — the "already in
 * schedule" affordance. Builds a probe item for the verse and looks it up in the
 * active schedule via the store's content-identity duplicate check; the
 * schedule-all-tab's highlight effect handles the scroll.
 */
function scrollToScheduled(verse: Verse, translation: string): void {
  const store = useScheduleStore.getState()
  const scheduleId = store.activeScheduleId
  if (!scheduleId) return
  const probe = buildScriptureScheduleItem(verse, translation, 0)
  const existing = store.findDuplicate(scheduleId, probe)
  if (existing) store.flashItem(existing.id)
}

/**
 * The add-to-schedule control on a verse row. When the verse is already in the
 * running order it is a `CheckIcon` button that flashes (and scrolls to) the
 * existing item; otherwise a `CalendarPlusIcon` button that appends the verse as
 * a single scripture item straight into the schedule (the All tab), never the AI
 * verse queue.
 *
 * Shared by the book- and context-search rows. `positionClassName` carries the
 * per-list placement (the book row is inline; the context row is
 * absolute-positioned at the row's right edge); `addClassName` carries the add
 * button's per-list colour variant.
 */
export function ScheduleButton({
  verse,
  translation,
  scheduled,
  positionClassName,
  addClassName,
}: {
  verse: Verse
  translation: string
  scheduled: boolean
  positionClassName?: string
  addClassName?: string
}) {
  if (scheduled) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Already in schedule — scroll to it"
              className={cn(
                "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring",
                positionClassName
              )}
              onClick={(e) => {
                e.stopPropagation()
                scrollToScheduled(verse, translation)
              }}
            >
              <CheckIcon className="size-4 text-ai-direct" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Already in schedule</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Add to schedule"
            className={cn(
              "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
              positionClassName,
              addClassName
            )}
            onClick={(e) => {
              e.stopPropagation()
              const store = useScheduleStore.getState()
              const scheduleId = store.activeScheduleId
              if (!scheduleId) {
                toast.error("No active schedule — select or create one first")
                return
              }
              const insertAt = insertPosition()
              const item = buildScriptureScheduleItem(
                verse,
                translation,
                insertAt
              )
              if (store.insertItemAt(scheduleId, item, insertAt)) {
                toast.success(`Added ${item.label} to schedule`)
              } else {
                toast.info("Already in the schedule")
              }
            }}
          >
            <CalendarPlusIcon className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Add to schedule</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
