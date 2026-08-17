import { useRef, useEffect, memo } from "react"

import {
  CopyIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  TrashIcon,
  PlayCircleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { usePresentationStore } from "@/stores/presentation-store"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { TRANSITION_LABELS } from "@/lib/slides/element-meta"
import { cn } from "@/lib/utils"
import type { Slide, SlideTransitionType } from "@/types/slide"

export const SlideThumb = memo(function SlideThumb({
  slide,
  index,
  active,
  total,
  onPreviewTransition,
}: {
  slide: Slide
  index: number
  active: boolean
  total: number
  onPreviewTransition?: (slideIndex: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const paint = () => {
      canvas.width = 192
      canvas.height = 108
      renderSlide(ctx, slide, 192, 108, getSlideImageCache())
    }
    paint()
    if (slide.background.type === "image") {
      ensureSlideImages(slide.background.imageUrl, paint)
    }
    for (const el of slide.elements) {
      if (el.type === "image" && el.imageUrl) {
        ensureSlideImages(el.imageUrl, paint)
      }
    }
  }, [slide])

  const currentTransition = slide.transition?.type ?? "cut"

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-md border transition-all",
        active
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/30"
      )}
    >
      <button
        type="button"
        className="w-full"
        onClick={() =>
          usePresentationStore.getState().setActiveSlideIndex(index)
        }
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-t-md bg-muted">
          <canvas ref={canvasRef} className="size-full object-contain" />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[0.5625rem] text-white">
            {index + 1}
          </span>
        </div>
      </button>

      {/* Transition selector */}
      {index > 0 && (
        <div className="flex items-center gap-1 border-t border-border px-1 py-0.5">
          <select
            className="h-5 w-full rounded bg-card text-[0.5625rem] text-muted-foreground hover:text-foreground [&>option]:bg-card [&>option]:text-foreground"
            value={currentTransition}
            onChange={(e) => {
              const type = e.target.value as SlideTransitionType
              const store = usePresentationStore.getState()
              store.updateDraftSlide({
                ...slide,
                transition:
                  type === "cut"
                    ? undefined
                    : { type, duration: slide.transition?.duration ?? 500 },
              })
            }}
            title="Slide transition"
          >
            {Object.entries(TRANSITION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {currentTransition !== "cut" && (
            <>
              <input
                type="number"
                className="h-5 w-12 rounded border border-border bg-transparent px-1 text-[0.5625rem] text-muted-foreground"
                value={slide.transition?.duration ?? 500}
                min={100}
                max={3000}
                step={100}
                title="Duration (ms)"
                onChange={(e) => {
                  const store = usePresentationStore.getState()
                  store.updateDraftSlide({
                    ...slide,
                    transition: {
                      type: currentTransition as SlideTransitionType,
                      duration: Number(e.target.value),
                    },
                  })
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5 shrink-0"
                title="Preview transition"
                onClick={() => onPreviewTransition?.(index)}
              >
                <PlayCircleIcon className="size-3" />
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-0.5 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          title="Duplicate slide"
          onClick={() => usePresentationStore.getState().duplicateSlide(index)}
        >
          <CopyIcon className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          title="Move up"
          disabled={index === 0}
          onClick={() =>
            usePresentationStore.getState().reorderSlide(index, index - 1)
          }
        >
          <ChevronUpIcon className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          title="Move down"
          disabled={index === total - 1}
          onClick={() =>
            usePresentationStore.getState().reorderSlide(index, index + 1)
          }
        >
          <ChevronDownIcon className="size-2.5" />
        </Button>
        {total > 1 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5 text-destructive hover:text-destructive"
            title="Delete slide"
            onClick={() => usePresentationStore.getState().removeSlide(index)}
          >
            <TrashIcon className="size-2.5" />
          </Button>
        )}
      </div>
    </div>
  )
})
