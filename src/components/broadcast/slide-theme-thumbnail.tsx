import { useRef, useEffect, useMemo, useCallback, memo } from "react"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { buildThemePreviewSlide } from "@/lib/theme"
import type { SlideTheme } from "@/types/slide"
import { cn } from "@/lib/utils"

/**
 * A static thumbnail for a slide/song theme in the unified Theme Designer list
 * (theme-unification-plan.md, Phase 2). Slide themes can't render through
 * `CanvasVerse` (that's the broadcast/verse engine), so this draws the theme's
 * representative `content-only` variant — background + its sample lyric — with
 * the slide renderer.
 *
 * Deliberately single-shot (no RAF): the library shows many cards at once, so an
 * animated background renders one static frame here (the live/designer surfaces
 * animate). Keeps a grid of song themes cheap.
 */

const W = 480
const H = 270

export const SlideThemeThumbnail = memo(function SlideThemeThumbnail({
  theme,
  className,
}: {
  theme: SlideTheme
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const slide = useMemo(() => {
    let n = 0
    return buildThemePreviewSlide(theme, () => `${theme.id}-preview-${n++}`)
  }, [theme])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    renderSlide(ctx, slide, canvas.width, canvas.height, getSlideImageCache())
  }, [slide])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = W
    canvas.height = H
    draw()
    // Any image elements load async; redraw once they're cached.
    for (const el of slide.elements) {
      if (el.type === "image" && el.imageUrl) {
        ensureSlideImages(el.imageUrl, draw)
      }
    }
  }, [draw, slide])

  return (
    <canvas
      ref={canvasRef}
      className={cn("aspect-video w-full rounded-md", className)}
    />
  )
})
