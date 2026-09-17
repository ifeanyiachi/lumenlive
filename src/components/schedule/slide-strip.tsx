import { useRef, useEffect, useCallback, memo } from "react"
import {
  renderSlide,
  scriptureElementToVerseStyle,
  type ScriptureRenderPayload,
} from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { cn } from "@/lib/utils"
import type { Slide, SlideScriptureElement } from "@/types/slide"
import type { VerseRenderData } from "@/types/broadcast"

const THUMB_W = 64
const THUMB_H = 36

interface SlideStripProps {
  slides: Slide[]
  /**
   * Live scripture payloads, parallel to `slides`, for a scripture-collection
   * deck. Scripture slides are style-only (decision D2), so a slide with an entry
   * here renders its verse from the payload; without it the strip draws the slide
   * as-is (songs / grouped slide decks pass nothing).
   */
  verses?: (VerseRenderData | undefined)[]
  activeIndex: number
  onSlideClick: (index: number) => void
  /** Double-tap a sub-slide to send it straight to the live audience. */
  onSlideDoubleClick?: (index: number) => void
}

/**
 * Build the render-time scripture payload for a style-only scripture slide, so
 * plain `renderSlide` lays out the verse (mirrors ScheduleItemThumbnail). Returns
 * undefined when the slide has no scripture element or no verse was supplied.
 */
function scriptureContentFor(
  slide: Slide,
  verse: VerseRenderData | undefined
): Map<string, ScriptureRenderPayload> | undefined {
  if (!verse) return undefined
  const el = slide.elements.find((e) => e.type === "scripture") as
    SlideScriptureElement | undefined
  if (!el) return undefined
  return new Map<string, ScriptureRenderPayload>([
    [
      el.id,
      {
        verse,
        style: scriptureElementToVerseStyle(el),
        options: {
          scale: 1,
          verseAutoFit: false,
          maxVerseScale: 1,
          minVerseFontSize: 40,
        },
      },
    ],
  ])
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
  verse,
  index,
  isActive,
  onSelect,
  onDoubleSelect,
}: {
  slide: Slide
  verse?: VerseRenderData
  index: number
  isActive: boolean
  onSelect: (index: number) => void
  onDoubleSelect: (index: number) => void
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
    const scriptureContent = scriptureContentFor(slide, verse)
    renderSlide(
      ctx,
      slide,
      THUMB_W * 2,
      THUMB_H * 2,
      getSlideImageCache(),
      undefined,
      scriptureContent ? { scriptureContent } : undefined
    )
    if (slide.background.type === "image" && slide.background.imageUrl) {
      ensureSlideImages(slide.background.imageUrl, () => drawRef.current())
    }
  }, [slide, verse])

  useEffect(() => {
    drawRef.current = draw
    draw()
  }, [draw])

  // Scripture slides are style-only, so their text lives in the verse payload,
  // not the slide element — label from the reference when we have one.
  const preview = verse?.reference || slidePreviewText(slide)

  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      onDoubleClick={() => onDoubleSelect(index)}
      title={preview}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1 pr-2 pl-7 text-left text-xs transition-colors select-none",
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
  verses,
  activeIndex,
  onSlideClick,
  onSlideDoubleClick,
}: SlideStripProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // The parent passes fresh onSlideClick/onSlideDoubleClick closures each render;
  // bounce through refs so the handlers given to each memoized SlideRow stay
  // referentially stable and unchanged rows skip re-rendering.
  const onSlideClickRef = useRef(onSlideClick)
  const onSlideDoubleClickRef = useRef(onSlideDoubleClick)
  useEffect(() => {
    onSlideClickRef.current = onSlideClick
    onSlideDoubleClickRef.current = onSlideDoubleClick
  })
  const handleSelect = useCallback(
    (index: number) => onSlideClickRef.current(index),
    []
  )
  const handleDoubleSelect = useCallback(
    (index: number) => onSlideDoubleClickRef.current?.(index),
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
          verse={verses?.[idx]}
          index={idx}
          isActive={idx === activeIndex}
          onSelect={handleSelect}
          onDoubleSelect={handleDoubleSelect}
        />
      ))}
    </div>
  )
}
