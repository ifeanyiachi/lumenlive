import { memo, useCallback, useEffect, useRef } from "react"
import { renderSlide, type ScriptureRenderPayload } from "@/lib/slide-renderer"
import { runSlidePreviewEffect } from "@/lib/slide-renderer/preview-loop"
import { getSlideImageCache } from "@/lib/slide-image-cache"
import { cn } from "@/lib/utils"
import type { Slide } from "@/types/slide"

interface SlideCanvasProps {
  slide: Slide
  /**
   * Mirror the audience "Clear": draw the slide backdrop but hide text/elements.
   * Undefined renders the full slide (default) — byte-identical to omitting it.
   */
  hideElements?: boolean
  /**
   * Live scripture payloads for scripture placeholders, keyed by element id (RF3c) —
   * lets a presented scripture slide fill its style-only placeholder through the same
   * verse-renderer draw passes the audience output uses, so the operator preview
   * matches. Omitted for ordinary slides.
   */
  scriptureContent?: Map<string, ScriptureRenderPayload>
  className?: string
}

/**
 * Shared operator slide preview — a 1920×1080 canvas driven by `renderSlide`, with
 * the video/animated-background loop owned by `runSlidePreviewEffect`. Replaces the
 * duplicated `SlidePreviewCanvas` (schedule preview) and `LiveSlideCanvas` (live
 * monitor); the audience/NDI output draws the same slide through the compositor's
 * `renderSlideContent`, so all three surfaces share one render path (D1).
 */
export const SlideCanvas = memo(function SlideCanvas({
  slide,
  hideElements,
  scriptureContent,
  className,
}: SlideCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const rafRef = useRef<number>(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = 1920
    canvas.height = 1080
    renderSlide(
      ctx,
      slide,
      1920,
      1080,
      getSlideImageCache(),
      videoCacheRef.current,
      {
        frameTime: performance.now(),
        now: Date.now(),
        hideElements,
        scriptureContent,
      }
    )
  }, [slide, hideElements, scriptureContent])

  useEffect(() => {
    return runSlidePreviewEffect(slide, draw, {
      rafRef,
      videoRef,
      videoCache: videoCacheRef.current,
    })
  }, [draw, slide])

  return (
    <canvas
      ref={canvasRef}
      className={cn("max-h-full max-w-full", className)}
      style={{ aspectRatio: "16/9", objectFit: "contain" }}
    />
  )
})
