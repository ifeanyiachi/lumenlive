import { useRef, useEffect } from "react"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import type { Presentation } from "@/types/slide"
import { cn } from "@/lib/utils"

export function PresentationCard({
  presentation,
  selected,
  onSelect,
  onEdit,
}: {
  presentation: Presentation
  selected: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || presentation.slides.length === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const paint = () => {
      canvas.width = 384
      canvas.height = 216
      renderSlide(ctx, presentation.slides[0], 384, 216, getSlideImageCache())
    }
    paint()
    const slide = presentation.slides[0]
    if (slide.background.type === "image") {
      ensureSlideImages(slide.background.imageUrl, paint)
    }
  }, [presentation])

  return (
    <button
      type="button"
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card text-left transition-all",
        selected
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/30"
      )}
      onClick={onSelect}
      onDoubleClick={onEdit}
    >
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <canvas
          ref={canvasRef}
          className="size-full object-contain"
          style={{ aspectRatio: "16/9" }}
        />
      </div>
      <div className="flex items-center gap-2 p-2">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {presentation.name}
        </span>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
          {presentation.slides.length}{" "}
          {presentation.slides.length === 1 ? "slide" : "slides"}
        </span>
      </div>
    </button>
  )
}
