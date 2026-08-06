import { useRef, useEffect, useCallback, memo } from "react"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { cn } from "@/lib/utils"
import type { Slide } from "@/types/slide"

const THUMB_W = 64
const THUMB_H = 36

interface SlideStripProps {
  slides: Slide[]
  activeIndex: number
  onSlideClick: (index: number) => void
}

/**
 * A one-line preview label for a slide row: the first non-empty text or
 * scripture content, collapsed to a single line. Falls back to the slide name.
 */
function slidePreviewText(slide: Slide): string {
  for (const el of slide.elements) {
    if (el.type === "text" && el.text.trim()) return el.text
    if (el.type === "scripture") {
      const t = el.verseText.trim() || el.reference.trim()
      if (t) return t
    }
  }
  return slide.name
}

const SlideRow = memo(function SlideRow({
  slide,
  index,
  isActive,
  onSelect,
}: {
  slide: Slide
  index: number
  isActive: boolean
  onSelect: (index: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Holds the latest draw so the async image-load callback can redraw without
  // draw() referencing itself (which the compiler flags and risks stale closures).
  const drawRef = useRef<() => void>(() => {})

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = THUMB_W * 2
    canvas.height = THUMB_H * 2
    renderSlide(ctx, slide, THUMB_W * 2, THUMB_H * 2, getSlideImageCache())
    if (slide.background.type === "image" && slide.background.imageUrl) {
      ensureSlideImages(slide.background.imageUrl, () => drawRef.current())
    }
  }, [slide])

  useEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw])

  const preview = slidePreviewText(slide)

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      title={preview}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1 pr-2 pl-7 text-left text-xs transition-colors",
        isActive
          ? "bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <span className="w-4 shrink-0 text-right text-[0.625rem] text-muted-foreground/60 tabular-nums">
        {index + 1}
      </span>
      <canvas
        ref={canvasRef}
        className={cn(
          "block shrink-0 rounded-[3px] border",
          isActive
            ? "border-primary ring-1 ring-primary/40"
            : "border-border/50"
        )}
        style={{ width: THUMB_W, height: THUMB_H }}
      />
      <span className="min-w-0 flex-1 truncate">{preview}</span>
    </button>
  )
})

export function SlideStrip({
  slides,
  activeIndex,
  onSlideClick,
}: SlideStripProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // The parent passes a fresh onSlideClick closure each render; bounce through a
  // ref so the handler given to each memoized SlideRow stays referentially
  // stable and unchanged rows skip re-rendering.
  const onSlideClickRef = useRef(onSlideClick)
  useEffect(() => {
    onSlideClickRef.current = onSlideClick
  })
  const handleSelect = useCallback(
    (index: number) => onSlideClickRef.current(index),
    []
  )

  // Keep the active slide row visible within whichever ancestor scrolls the
  // schedule list. `scrollIntoView({ block: "nearest" })` walks up to the
  // nearest scrollable container, so it works without knowing the list is
  // wrapped in a Radix ScrollArea.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const activeEl = container.children[activeIndex] as HTMLElement | undefined
    activeEl?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  return (
    <div ref={containerRef} className="flex flex-col gap-0.5 pb-0.5">
      {slides.map((slide, idx) => (
        <SlideRow
          key={slide.id}
          slide={slide}
          index={idx}
          isActive={idx === activeIndex}
          onSelect={handleSelect}
        />
      ))}
    </div>
  )
}
