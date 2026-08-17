import { memo, useCallback, useEffect, useRef } from "react"
import { useBroadcastStore, useAlertStore, useCountdownStore } from "@/stores"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  drawOperatorOverlays,
  overlaysNeedAnimation,
} from "@/lib/broadcast-output/operator-overlay-data"
import { cn } from "@/lib/utils"

/**
 * Operator overlay layer for the "Live display" — a single 1920×1080 canvas that
 * reuses the audience painters (props / alert bars / countdowns) through
 * `drawOperatorOverlays` (D2). It replaces the old DOM mirrors (`PropsOverlay`,
 * `AlertPreviewOverlay`), which re-implemented the same overlays a second way and
 * drifted from the audience by construction — different marquee timing, no
 * countdown mirror at all, alerts stacked over Black. Drawing through the exact
 * audience painters makes the operator's mirror a faithful reflection of the
 * projector/NDI feed: same geometry, same scroll, same overlay order.
 *
 * The canvas letterboxes exactly like `SlideCanvas`/`CanvasVerse` (16:9,
 * `object-contain`) inside the same `inset-3` content box, so overlays land where
 * they do on the audience relative to the content. `pointer-events-none` and
 * layered below the Logo/Black finishers (z-20) so Black covers overlays — as on
 * the audience, where `paintLogoAndBlackout` runs after `paintOverlays`.
 */
export const OverlayCanvas = memo(function OverlayCanvas({
  className,
}: {
  className?: string
}) {
  const props = useBroadcastStore((s) => s.props)
  const themes = useBroadcastStore((s) => s.themes)
  const activeAlerts = useAlertStore((s) => s.activeAlerts)
  const alertTemplates = useAlertStore((s) => s.templates)
  const activeCountdowns = useCountdownStore((s) => s.activeCountdowns)
  const timers = useCountdownStore((s) => s.timers)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const rafRef = useRef<number>(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    // Assigning width resets + clears the canvas each frame (as SlideCanvas does).
    canvas.width = 1920
    canvas.height = 1080
    drawOperatorOverlays(
      ctx,
      1920,
      1080,
      { props, activeAlerts, alertTemplates, activeCountdowns, timers, themes },
      imageCacheRef.current,
      Date.now()
    )
  }, [props, activeAlerts, alertTemplates, activeCountdowns, timers, themes])

  // Preload image props. The painter looks the image up by the RAW `imageUrl`, so
  // cache under that key; the loaded `src` goes through `safeFileSrc` for the
  // main window's asset protocol (the audience output loads raw asset URLs).
  useEffect(() => {
    for (const prop of props) {
      if (
        prop.type === "image" &&
        prop.imageUrl &&
        !imageCacheRef.current.has(prop.imageUrl)
      ) {
        const key = prop.imageUrl
        const img = new Image()
        img.onload = () => {
          imageCacheRef.current.set(key, img)
          draw()
        }
        img.src = safeFileSrc(key)
      }
    }
  }, [props, draw])

  // One draw on any change; a per-frame RAF only while something animates (a
  // marquee scrolls, a countdown ticks/flashes) — static props/alerts need none.
  useEffect(() => {
    draw()
    if (!overlaysNeedAnimation(props, activeCountdowns.length)) return
    const loop = () => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw, props, activeCountdowns.length])

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-3 z-[15] flex items-center justify-center",
        className
      )}
    >
      <canvas
        ref={canvasRef}
        className="max-h-full max-w-full"
        style={{ aspectRatio: "16/9", objectFit: "contain" }}
      />
    </div>
  )
})
