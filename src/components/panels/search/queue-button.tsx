import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { CheckIcon, PlusIcon } from "lucide-react"
import { useQueueStore } from "@/stores"
import { verseReference } from "@/lib/search/verse-keys"
import { makeQueueItem } from "@/lib/search/queue-item"
import type { Verse } from "@/types"

/**
 * Flash the matching queue item and scroll it into view — the "already in queue"
 * affordance shared by both search rows. Looks the verse up in the live queue by
 * its book/chapter/verse and, if present, pulses it and scrolls the queue panel.
 */
function scrollToQueued(verse: Verse): void {
  const store = useQueueStore.getState()
  const idx = store.findDuplicate(verse.book_number, verse.chapter, verse.verse)
  if (idx !== -1) {
    store.flashItem(store.items[idx].id)
    document
      .querySelector(`[data-slot="queue-panel"] [data-queue-idx="${idx}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }
}

/**
 * The add-to-queue control on a verse row. When the verse is already queued it is
 * a `CheckIcon` button that scrolls to (and flashes) the existing item; otherwise
 * a `PlusIcon` add button that appends a manual {@link makeQueueItem}.
 *
 * Shared by the book- and context-search rows. `positionClassName` carries the
 * per-list placement (the book row is inline; the context row is
 * absolute-positioned at the row's right edge); `addClassName` carries the add
 * button's per-list colour variant. Both states render a real, keyboard-focusable
 * `<button>` (the context "already in queue" indicator used to be a
 * non-focusable `<span>` — unified here to the accessible form).
 */
export function QueueButton({
  verse,
  confidence,
  queued,
  positionClassName,
  addClassName,
}: {
  verse: Verse
  confidence: number
  queued: boolean
  positionClassName?: string
  addClassName?: string
}) {
  if (queued) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Already in queue — scroll to it"
              className={cn(
                "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring",
                positionClassName
              )}
              onClick={(e) => {
                e.stopPropagation()
                scrollToQueued(verse)
              }}
            >
              <CheckIcon className="size-4 text-ai-direct" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Already in queue</TooltipContent>
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
            aria-label="Add to queue"
            className={cn(
              "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
              positionClassName,
              addClassName
            )}
            onClick={(e) => {
              e.stopPropagation()
              useQueueStore.getState().addItem(
                makeQueueItem({
                  verse,
                  reference: verseReference(verse),
                  confidence,
                })
              )
            }}
          >
            <PlusIcon className="size-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Add to queue</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
