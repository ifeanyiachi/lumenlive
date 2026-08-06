import { useMemo, useRef, useState } from "react"
import {
  PlusIcon,
  TrashIcon,
  StarIcon,
  XIcon,
  GripVerticalIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSongStore } from "@/stores/song-store"
import { cn } from "@/lib/utils"
import type { Song } from "@/types/song"

/**
 * The arrangement builder: pick (or create) a named performance order, then
 * append/remove/reorder section chips into it. A section can appear multiple
 * times (repeated chorus). Reordering uses the app's pointer DnD, matching the
 * sections list. Ids that no longer resolve to a section are dropped from the
 * view (and the generator skips them), so deleting a section can't corrupt an
 * arrangement.
 */
export function SongArrangementBuilder({ song }: { song: Song }) {
  // `pickedId` is the operator's explicit selection; the *effective* active
  // arrangement is derived from it and falls back to the default when the pick
  // is null or no longer resolves (e.g. the picked arrangement was deleted), so
  // no effect is needed to keep the selection valid.
  const [pickedId, setPickedId] = useState<string | null>(null)
  const active =
    song.arrangements.find((a) => a.id === pickedId) ??
    song.arrangements.find((a) => a.isDefault) ??
    song.arrangements[0] ??
    null
  const activeId = active?.id ?? null

  const sectionById = useMemo(
    () => new Map(song.sections.map((s) => [s.id, s])),
    [song.sections]
  )

  // Pointer reorder of the ordered chips.
  const [dragOver, setDragOver] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndexRef.current === null || !rowRef.current) return
    const chips =
      rowRef.current.querySelectorAll<HTMLElement>("[data-slot-idx]")
    for (const chip of chips) {
      const rect = chip.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX < rect.right) {
        const idx = Number(chip.dataset.slotIdx)
        setDragOver(idx !== dragIndexRef.current ? idx : null)
        return
      }
    }
  }

  const handlePointerUp = () => {
    const from = dragIndexRef.current
    if (active && from !== null && dragOver !== null && from !== dragOver) {
      useSongStore
        .getState()
        .reorderArrangementSlot(song.id, active.id, from, dragOver)
    }
    dragIndexRef.current = null
    setDragOver(null)
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Arrangements
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => useSongStore.getState().addArrangement(song.id)}
        >
          <PlusIcon className="size-3" />
          New
        </Button>
      </div>

      {/* Arrangement picker + name + default + delete */}
      <div className="flex items-center gap-1.5">
        <Select value={activeId ?? undefined} onValueChange={setPickedId}>
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue placeholder="Select arrangement" />
          </SelectTrigger>
          <SelectContent>
            {song.arrangements.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.name}
                {a.isDefault ? " ★" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {active && (
          <>
            <Input
              value={active.name}
              aria-label="Arrangement name"
              onChange={(e) =>
                useSongStore.getState().updateArrangement(song.id, active.id, {
                  name: e.target.value,
                })
              }
              className="h-7 flex-1 text-xs"
            />
            <Button
              variant={active.isDefault ? "secondary" : "ghost"}
              size="icon-sm"
              aria-label="Set as default arrangement"
              title={
                active.isDefault ? "Default arrangement" : "Set as default"
              }
              disabled={active.isDefault}
              onClick={() =>
                useSongStore
                  .getState()
                  .setDefaultArrangement(song.id, active.id)
              }
            >
              <StarIcon
                className={cn("size-3.5", active.isDefault && "fill-current")}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Delete arrangement"
              disabled={song.arrangements.length <= 1}
              onClick={() =>
                useSongStore.getState().removeArrangement(song.id, active.id)
              }
            >
              <TrashIcon className="size-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Ordered chips */}
      {active && (
        <div
          ref={rowRef}
          className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border p-2"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {active.sectionIds.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Add sections below to build the order
            </span>
          )}
          {active.sectionIds.map((sectionId, slotIndex) => {
            const section = sectionById.get(sectionId)
            if (!section) return null
            return (
              <Badge
                key={`${sectionId}-${slotIndex}`}
                data-slot-idx={slotIndex}
                variant="secondary"
                className={cn(
                  "gap-1 py-1 text-[0.6875rem]",
                  dragOver === slotIndex && "ring-1 ring-primary"
                )}
              >
                <button
                  type="button"
                  aria-label="Drag to reorder"
                  className="cursor-grab touch-none"
                  onPointerDown={(e) => {
                    ;(e.currentTarget as HTMLElement).setPointerCapture(
                      e.pointerId
                    )
                    dragIndexRef.current = slotIndex
                  }}
                >
                  <GripVerticalIcon className="size-3" />
                </button>
                {section.label}
                <button
                  type="button"
                  aria-label="Remove from arrangement"
                  onClick={() =>
                    useSongStore
                      .getState()
                      .removeArrangementSlot(song.id, active.id, slotIndex)
                  }
                  className="ml-0.5 rounded-full hover:bg-muted"
                >
                  <XIcon className="size-2.5" />
                </button>
              </Badge>
            )
          })}
        </div>
      )}

      {/* Section palette — click to append to the active arrangement */}
      {active && song.sections.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[0.625rem] tracking-wider text-muted-foreground uppercase">
            Add section
          </span>
          <div className="flex flex-wrap gap-1.5">
            {song.sections.map((section) => (
              <Button
                key={section.id}
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() =>
                  useSongStore
                    .getState()
                    .addSectionToArrangement(song.id, active.id, section.id)
                }
              >
                <PlusIcon className="size-3" />
                {section.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
