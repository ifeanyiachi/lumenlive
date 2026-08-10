import { useRef, useEffect, useState, useCallback, memo } from "react"
import { renderVerse } from "@/lib/verse-renderer"
import type { BroadcastTheme, VerseRenderData } from "@/types"
import { cn } from "@/lib/utils"

interface CanvasVerseProps {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  className?: string
  /**
   * Mirror the live output's verse auto-fit so operator previews match what the
   * audience sees (a long multi-verse block shrinks to fit instead of clipping).
   * Off by default — the design/thumbnail callers keep authored sizes.
   */
  verseAutoFit?: boolean
  maxVerseScale?: number
  minVerseFontSize?: number
}

export const CanvasVerse = memo(function CanvasVerse({
  theme,
  verse,
  className,
  verseAutoFit,
  maxVerseScale,
  minVerseFontSize,
}: CanvasVerseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const [containerWidth, setContainerWidth] = useState(0)

  // Measure container width with ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      if (w > 0) setContainerWidth(w)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || containerWidth === 0) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const aspectRatio = theme.resolution.width / theme.resolution.height
    const displayW = containerWidth
    const displayH = displayW / aspectRatio

    // The backing store IS the render surface (device pixels), so the verse
    // reflows/auto-fits exactly like the live output — just at thumbnail size.
    const bw = Math.max(1, Math.round(displayW * dpr))
    const bh = Math.max(1, Math.round(displayH * dpr))
    canvas.width = bw
    canvas.height = bh
    canvas.style.width = `${displayW}px`
    canvas.style.height = `${displayH}px`

    renderVerse(ctx, theme, verse, {
      imageCache: imageCacheRef.current,
      surface: { width: bw, height: bh },
      verseAutoFit,
      maxVerseScale,
      minVerseFontSize,
    })
  }, [theme, verse, containerWidth, verseAutoFit, maxVerseScale, minVerseFontSize])

  // Preload background image so the renderer can find it in the cache.
  useEffect(() => {
    const bg = theme.background
    if (bg.type !== "image" || !bg.image?.url) return
    const url = bg.image.url
    const cache = imageCacheRef.current
    if (cache.has(url)) return

    const img = new Image()
    img.onload = () => {
      cache.set(url, img)
      draw()
    }
    img.onerror = () => {
      console.warn("[canvas-verse] failed to load background image", {
        url: url.slice(0, 100),
      })
    }
    img.src = url
  }, [theme.background, draw])

  // Redraw whenever theme, verse, or container size changes.
  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div ref={containerRef} className={cn("w-full", className)}>
      <canvas ref={canvasRef} className="w-full rounded-md" />
    </div>
  )
})
