import { useEffect, useRef } from "react"
import { useBroadcastStore } from "@/stores"
import { drawStageDisplay } from "@/lib/stage-display-renderer"
import type { StageDisplayData } from "@/lib/stage-display-renderer"
import type { StageLayout } from "@/types/stage-layout"
import type { BroadcastTheme, VerseRenderData } from "@/types"
import { DEFAULT_COUNTDOWN } from "@/types/alert"
import { cn } from "@/lib/utils"

const SAMPLE_VERSE: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ verseNumber: 16, text: "For God so loved the world…" }],
}
const SAMPLE_NOTES = "Welcome — Call to worship, then announcements."

/** Persistent scratch caches; empty is fine (previews use no media). */
const imageCache = new Map<string, HTMLImageElement>()
const videoCache = new Map<string, HTMLVideoElement>()

/**
 * Renders a `StageLayout` to a 1920×1080 canvas (CSS-scaled to fit) using the
 * production `drawStageDisplay`, with representative sample content. Shared by
 * the library thumbnails and the editor's canvas background so what you author
 * is exactly what the monitor shows.
 */
export function StagePreviewCanvas({
  layout,
  theme,
  className,
}: {
  layout: StageLayout
  theme?: BroadcastTheme | null
  className?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackTheme = useBroadcastStore((s) => s.themes[0])
  const activeTheme = theme ?? fallbackTheme

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeTheme) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = 1920
    canvas.height = 1080
    const data: StageDisplayData = {
      layout,
      currentTheme: activeTheme,
      currentVerse: SAMPLE_VERSE,
      currentSlide: null,
      notes: SAMPLE_NOTES,
      timer: {
        timer: { ...DEFAULT_COUNTDOWN, label: "Sermon", durationSeconds: 720 },
        countdown: {
          id: "preview",
          timerId: DEFAULT_COUNTDOWN.id,
          mode: "duration",
          startedAt: Date.now(),
          durationSeconds: 720,
          state: "running",
          accumulatedPausedMs: 0,
        },
      },
      message: "5 MINUTES",
      announcement: "Fellowship lunch after the service.",
      playlist: ["Opening Prayer", "Worship Set", "Sermon", "Closing"],
    }
    drawStageDisplay(ctx, 1920, 1080, data, imageCache, videoCache)
  }, [layout, activeTheme])

  return (
    <canvas
      ref={canvasRef}
      className={cn("block h-full w-full object-contain", className)}
    />
  )
}
