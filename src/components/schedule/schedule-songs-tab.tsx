import { useMemo, useRef, useState } from "react"
import { MusicIcon, PlayIcon, TrashIcon, SettingsIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useScheduleStore } from "@/stores/schedule-store"
import { useSongStore } from "@/stores/song-store"
import { useDropZone } from "@/stores/drag-store"
import { addSongToSchedule } from "@/lib/schedule-song"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type { ScheduleItem, SongScheduleItem } from "@/types/schedule"
import type { Song } from "@/types/song"

/**
 * The Songs tab of the schedule panel: a **schedule list**, not the library. It
 * shows only the song items already added to the active schedule (drag a song
 * here from the Songs search/quick view, or double-click it there). Each row can
 * be presented, edited, or removed like any other schedule item — this is just a
 * song-filtered lens over the same running order the All tab shows.
 */
export function ScheduleSongsTab({
  onEditProperties,
}: {
  onEditProperties: (item: ScheduleItem) => void
}) {
  const schedules = useScheduleStore((s) => s.schedules)
  const activeScheduleId = useScheduleStore((s) => s.activeScheduleId)
  const activeItemIndex = useScheduleStore((s) => s.activeItemIndex)
  const selectedItemId = useScheduleStore((s) => s.selectedItemId)
  const highlightedId = useScheduleStore((s) => s.highlightedId)
  const songs = useSongStore((s) => s.songs)

  const activeSchedule = schedules.find((sc) => sc.id === activeScheduleId)

  // Index songs by id once so each row is an O(1) lookup for its authors/section
  // metadata rather than an O(songs) find inside the render map.
  const songById = useMemo(() => {
    const m = new Map<string, Song>()
    for (const s of songs) m.set(s.id, s)
    return m
  }, [songs])

  // The song items in running order, paired with their real index in the full
  // item list so Present/select act on the correct position.
  const songRows = useMemo(() => {
    const items = activeSchedule?.items ?? []
    const rows: { item: SongScheduleItem; index: number }[] = []
    items.forEach((item, index) => {
      if (item.type === "song") rows.push({ item, index })
    })
    return rows
  }, [activeSchedule?.items])

  const [confirmClear, setConfirmClear] = useState(false)

  const dropZoneRef = useRef<HTMLDivElement>(null)
  const dragOver = useDropZone(dropZoneRef, {
    accepts: ["song"],
    onDrop: (p) => {
      if (p.kind === "song") addSongToSchedule({ songId: p.songId })
    },
  })

  const store = useScheduleStore.getState()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[0.625rem] text-muted-foreground">
            Songs in this schedule
          </span>
          <Badge variant="outline">{songRows.length}</Badge>
        </div>
        {songRows.length > 0 && (
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
          dragOver && "bg-primary/5 ring-2 ring-primary/50 ring-inset"
        )}
      >
        <ScrollArea className="size-full">
          <div className="flex flex-col gap-0.5 p-1.5">
            {songRows.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {activeSchedule
                  ? "No songs yet — drag a song here from the Songs view, or double-click one to add it."
                  : "Select or create a schedule first."}
              </p>
            ) : (
              songRows.map(({ item, index }) => (
                <div key={item.id} className="min-w-0 overflow-hidden">
                  <SongScheduleRow
                    item={item}
                    index={index}
                    song={songById.get(item.songId)}
                    isActive={activeItemIndex === index}
                    isSelected={selectedItemId === item.id}
                    isHighlighted={highlightedId === item.id}
                    onPresent={() => store.goToItem(index)}
                    onPresentLive={() => void store.presentLive(index)}
                    onSelect={() => {
                      store.setSelectedItem(item.id)
                      store.goToItem(index)
                    }}
                    onEdit={() => onEditProperties(item)}
                    onRemove={() => {
                      if (!activeScheduleId) return
                      store.removeItem(activeScheduleId, item.id)
                      toast("Item removed")
                    }}
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear all songs"
        description={`Remove all ${songRows.length} song${
          songRows.length === 1 ? "" : "s"
        } from this schedule? Other items are left in place.`}
        confirmLabel="Clear all"
        onConfirm={() => {
          if (!activeScheduleId) return
          store.clearItems(activeScheduleId, (i) => i.type === "song")
          toast("Songs cleared")
        }}
      />
    </div>
  )
}

function SongScheduleRow({
  item,
  song,
  isActive,
  isSelected,
  isHighlighted,
  onPresent,
  onPresentLive,
  onSelect,
  onEdit,
  onRemove,
}: {
  item: SongScheduleItem
  index: number
  song: Song | undefined
  isActive: boolean
  isSelected: boolean
  isHighlighted: boolean
  onPresent: () => void
  onPresentLive: () => void
  onSelect: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const title = song?.title ?? item.cachedTitle ?? item.label
  const authors = song?.authors.join(", ") ?? ""
  const sectionCount = song?.sections.length

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onPresentLive}
      title={title}
      className={cn(
        "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors",
        isHighlighted
          ? "animate-pulse border border-amber-500/40 bg-amber-500/15 text-foreground"
          : isSelected
            ? "bg-primary/10 text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        isActive && "ring-1 ring-primary/30"
      )}
    >
      <MusicIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {title}
        </span>
        <span className="truncate text-[0.625rem] text-muted-foreground">
          {authors || "—"}
          {sectionCount !== undefined && (
            <>
              {" · "}
              {sectionCount} {sectionCount === 1 ? "section" : "sections"}
            </>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-xs"
          title="Present"
          onClick={(e) => {
            e.stopPropagation()
            onPresent()
          }}
        >
          <PlayIcon className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Remove"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          <TrashIcon className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Edit properties"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
        >
          <SettingsIcon className="size-2.5" />
        </Button>
      </div>
    </div>
  )
}
