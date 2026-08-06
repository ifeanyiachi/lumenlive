import { useRef, useState } from "react"
import { GripVerticalIcon, PlusIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSongStore } from "@/stores/song-store"
import { SECTION_TYPES, sectionTypeLabel } from "@/lib/song/song-mutations"
import { cn } from "@/lib/utils"
import type { Song, SongSectionType } from "@/types/song"

/**
 * The left pane of the song editor: one editable block per section (type, label,
 * lyrics) with add / remove / pointer-drag reorder. Reordering uses the app's own
 * pointer-based DnD (the same approach as schedule reordering) — HTML5 DnD is
 * broken under WebView2, and `@dnd-kit` is unused in this codebase.
 */
export function SongSectionsEditor({ song }: { song: Song }) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragIndexRef.current = index
    setDraggingIndex(index)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndexRef.current === null || !listRef.current) return
    const rows =
      listRef.current.querySelectorAll<HTMLElement>("[data-section-idx]")
    for (const row of rows) {
      const rect = row.getBoundingClientRect()
      if (e.clientY >= rect.top && e.clientY < rect.bottom) {
        const idx = Number(row.dataset.sectionIdx)
        setDragOverIndex(idx !== dragIndexRef.current ? idx : null)
        return
      }
    }
  }

  const handlePointerUp = () => {
    const from = dragIndexRef.current
    if (from !== null && dragOverIndex !== null && from !== dragOverIndex) {
      useSongStore.getState().reorderSection(song.id, from, dragOverIndex)
    }
    dragIndexRef.current = null
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Sections
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => useSongStore.getState().addSection(song.id)}
        >
          <PlusIcon className="size-3" />
          Add Section
        </Button>
      </div>

      <div
        ref={listRef}
        className="flex flex-col gap-3 px-3 pb-3"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {song.sections.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No sections yet — click "Add Section" to start.
          </p>
        )}

        {song.sections.map((section, index) => (
          <div
            key={section.id}
            data-section-idx={index}
            className={cn(
              "rounded-lg border border-border bg-background p-2",
              dragOverIndex === index && "border-t-2 border-t-primary",
              draggingIndex === index && "opacity-40"
            )}
          >
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                aria-label="Drag to reorder section"
                className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
                onPointerDown={(e) => handlePointerDown(e, index)}
              >
                <GripVerticalIcon className="size-4" />
              </button>

              <Select
                value={section.type}
                onValueChange={(v) =>
                  useSongStore.getState().updateSection(song.id, section.id, {
                    type: v as SongSectionType,
                  })
                }
              >
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {sectionTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                value={section.label}
                aria-label="Section label"
                placeholder="Label"
                onChange={(e) =>
                  useSongStore.getState().updateSection(song.id, section.id, {
                    label: e.target.value,
                  })
                }
                className="h-7 flex-1 text-xs"
              />

              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove section"
                onClick={() =>
                  useSongStore.getState().removeSection(song.id, section.id)
                }
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </div>

            <Textarea
              value={section.lyrics}
              aria-label={`${section.label} lyrics`}
              placeholder="Type lyrics, one line per row…"
              onChange={(e) =>
                useSongStore.getState().updateSection(song.id, section.id, {
                  lyrics: e.target.value,
                })
              }
              className="min-h-24 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
