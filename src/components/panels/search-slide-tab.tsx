import { useEffect, useMemo, useRef, useState } from "react"
import { LayoutTemplateIcon, SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { usePresentationStore } from "@/stores/presentation-store"
import { useDragSource } from "@/stores/drag-store"
import { addSlideToSchedule } from "@/lib/schedule-slide"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import type { Presentation } from "@/types/slide"

const THUMB_W = 128
const THUMB_H = 72

function DraggableSlideCard({ presentation }: { presentation: Presentation }) {
  const dragSource = useDragSource()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const dragHandlers = dragSource(() => ({
    payload: {
      kind: "slide" as const,
      presentationId: presentation.id,
      presentationName: presentation.name,
    },
    label: presentation.name,
  }))

  useEffect(() => {
    const canvas = canvasRef.current
    const slide = presentation.slides[0]
    if (!canvas || !slide) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const paint = () => {
      canvas.width = THUMB_W * 2
      canvas.height = THUMB_H * 2
      renderSlide(ctx, slide, THUMB_W * 2, THUMB_H * 2, getSlideImageCache())
    }
    paint()
    if (slide.background.type === "image" && slide.background.imageUrl) {
      ensureSlideImages(slide.background.imageUrl, paint)
    }
  }, [presentation])

  return (
    <button
      type="button"
      {...dragHandlers}
      onDoubleClick={() =>
        addSlideToSchedule({
          presentationId: presentation.id,
          presentationName: presentation.name,
        })
      }
      title={`${presentation.name} — drag to schedule or double-click to add`}
      className="group flex cursor-grab flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/50 hover:bg-accent/50 active:cursor-grabbing"
    >
      <div className="aspect-video w-full overflow-hidden bg-muted">
        {presentation.slides.length > 0 ? (
          <canvas ref={canvasRef} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <LayoutTemplateIcon className="size-7 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 p-1.5">
        <span className="min-w-0 flex-1 truncate text-[0.6875rem] font-medium text-foreground">
          {presentation.name}
        </span>
        <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[0.5rem] text-muted-foreground">
          {presentation.slides.length}
        </span>
      </div>
    </button>
  )
}

export function SearchSlideTab() {
  const presentations = usePresentationStore((s) => s.presentations)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return presentations
    return presentations.filter((p) => p.name.toLowerCase().includes(q))
  }, [presentations, query])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Search */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search slides..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            {presentations.length === 0
              ? "No slides yet — create presentations in the Slide view."
              : "No slides match your search."}
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2 p-2">
            {filtered.map((presentation) => (
              <DraggableSlideCard
                key={presentation.id}
                presentation={presentation}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
