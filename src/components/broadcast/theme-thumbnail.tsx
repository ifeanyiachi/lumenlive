import { useRef, useEffect, useMemo, useCallback, memo } from "react"
import { renderSlide } from "@/lib/slide-renderer"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { themeToSlide } from "@/lib/theme/render"
import type { Theme } from "@/types/theme"
import { cn } from "@/lib/utils"

/**
 * Static thumbnail for a type-first {@link Theme} in the Theme Designer list
 * (themeredo.md, Phase 3). A theme is already a styled slide, so this projects it
 * with `themeToSlide` and draws one frame through the shared slide renderer — the
 * same engine the live output uses, so the card matches what will present.
 *
 * Single-shot (no RAF): the library shows many cards at once, so an animated
 * background or a timer renders one static frame here; the editor/live surfaces
 * animate.
 */

const W = 480
const H = 270

export const ThemeThumbnail = memo(function ThemeThumbnail({
  theme,
  className,
}: {
  theme: Theme
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const slide = useMemo(() => {
    let n = 0
    return themeToSlide(theme, () => `${theme.id}-preview-${n++}`)
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
