import { memo, useEffect, useMemo, useRef } from "react"
import { renderSlide, slideHasAnimatedBackground } from "@/lib/slide-renderer"
import { getSlideImageCache } from "@/lib/slide-image-cache"
import {
  generateSlidesFromSong,
  resolveSongSlideOptions,
} from "@/lib/song/song-to-slides"
import { useSettingsStore } from "@/stores/settings-store"
import type { Slide } from "@/types/slide"
import type { Song } from "@/types/song"

const THUMB_W = 320
const THUMB_H = 180

/** A single 16:9 canvas that draws one generated slide via the slide renderer. */
const SlideThumb = memo(function SlideThumb({ slide }: { slide: Slide }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = THUMB_W * 2
    canvas.height = THUMB_H * 2

    const paint = () =>
      renderSlide(
        ctx,
        slide,
        canvas.width,
        canvas.height,
        getSlideImageCache(),
        undefined,
        {
          frameTime: performance.now(),
        }
      )

    // Animated backgrounds need a persistent loop to actually move; static
    // slides draw once.
    if (slideHasAnimatedBackground(slide)) {
      const tick = () => {
        paint()
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
      return () => cancelAnimationFrame(rafRef.current)
    }

    paint()
  }, [slide])

  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-md border border-border"
      style={{ aspectRatio: "16 / 9" }}
    />
  )
})

/**
 * The center pane of the song editor: a live preview of the deck that
 * `generateSlidesFromSong` produces for the song's default arrangement, using
 * the resolved (global default + per-song override) projection options. Because
 * the generator is pure, this recomputes only when the song or options change.
 */
export function SongSlidePreview({ song }: { song: Song }) {
  const defaults = useSettingsStore((s) => s.songSlideDefaults)

  const arrangement =
    song.arrangements.find((a) => a.isDefault) ?? song.arrangements[0] ?? null

  const slides = useMemo(() => {
    if (!arrangement) return []
    const options = resolveSongSlideOptions(defaults, song.slideOptions)
    // Fixed newId/now keep the preview stable across renders (this is display
    // only; the live/schedule path regenerates with real ids at go-live).
    let n = 0
    return generateSlidesFromSong(
      song,
      arrangement,
      options,
      () => `preview-${n++}`,
      0
    ).slides
  }, [song, arrangement, defaults])

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Preview
        </span>
        <span className="text-[0.625rem] text-muted-foreground">
          {slides.length} {slides.length === 1 ? "slide" : "slides"}
          {arrangement ? ` · ${arrangement.name}` : ""}
        </span>
      </div>

      {slides.length === 0 ? (
        <p className="px-3 py-10 text-center text-sm text-muted-foreground">
          Add lyrics and sections to the arrangement to preview slides.
        </p>
      ) : (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {slides.map((slide, index) => (
            <div key={slide.id} className="flex flex-col gap-1">
              <span className="text-[0.625rem] text-muted-foreground">
                {index + 1}. {slide.name}
              </span>
              <SlideThumb slide={slide} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
