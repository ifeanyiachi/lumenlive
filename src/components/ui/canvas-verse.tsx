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
  /**
   * Drive a per-frame redraw loop while the theme's background is procedural
   * `animated`, so the preview moves like the live output. Opt-in: thumbnail
   * grids leave it off so many cards don't each burn a RAF (a static frame reads
   * fine as a thumbnail). No effect for non-animated backgrounds.
   */
  animate?: boolean
}

export const CanvasVerse = memo(function CanvasVerse({
  theme,
  verse,
  className,
  verseAutoFit,
  maxVerseScale,
  minVerseFontSize,
  animate,
}: CanvasVerseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef = useRef<number | null>(null)
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
      frameTime: performance.now(),
    })
  }, [
    theme,
    verse,
    containerWidth,
    verseAutoFit,
    maxVerseScale,
    minVerseFontSize,
  ])

  // Opt-in per-frame loop for procedural animated backgrounds, so the preview
  // moves with the live output. Runs only while `animate` is set and the theme
  // background is `animated`; otherwise the single-shot redraw effect suffices.
  useEffect(() => {
    if (!animate || theme.background.type !== "animated") return
    const tick = () => {
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [animate, theme.background.type, draw])

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
