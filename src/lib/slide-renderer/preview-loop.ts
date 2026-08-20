/**
 * Slide preview loop — the background/animation lifecycle shared by every operator
 * slide-canvas surface (schedule preview + live monitor). Extracted from the two
 * near-identical `SlidePreviewCanvas`/`LiveSlideCanvas` effects (D1) so the
 * video-element lifecycle and RAF branch live in one tested place.
 *
 * Given a slide, a `draw()` callback (the caller owns the canvas + `renderSlide`),
 * and a small bag of persistent refs, this runs the exact effect body both
 * components used to inline:
 *   1. draw once, then preload any image assets and redraw when they land;
 *   2. cancel the previous frame loop and pause the previous background video;
 *   3. start a per-frame redraw loop for an animated background, or play (and
 *      loop on) a video background — reusing a cached `<video>` when present,
 *      otherwise creating and caching one.
 *
 * Returns a disposer that cancels the frame loop (call it on effect cleanup). No
 * React/Zustand/Tauri here — only DOM primitives (`<video>`, `requestAnimationFrame`),
 * exactly as the slide/verse renderers use.
 */

import type { Slide } from "@/types/slide"
import {
  slideHasAnimatedBackground,
  slideHasTimer,
  slideHasVideoBackground,
} from "./predicates"
import { ensureSlideImages } from "@/lib/slide-image-cache"

/**
 * Persistent per-canvas handles the loop reads and mutates across effect runs.
 * The component owns these as `useRef`s so a re-run can cancel the prior frame
 * and pause the prior video, and so decoded videos survive slide changes.
 */
export interface SlidePreviewRefs {
  /** Active `requestAnimationFrame` handle (0 when idle). */
  rafRef: { current: number }
  /** The currently-playing background video, so a re-run can pause it. */
  videoRef: { current: HTMLVideoElement | null }
  /** url → decoded `<video>`, reused across slides to avoid re-decoding. */
  videoCache: Map<string, HTMLVideoElement>
}

/**
 * Run the slide-preview effect body once and return its cleanup. Behaviour is
 * byte-identical to the two inline effects it replaces.
 */
export function runSlidePreviewEffect(
  slide: Slide,
  draw: () => void,
  refs: SlidePreviewRefs
): () => void {
  draw()

  if (slide.background.type === "image") {
    ensureSlideImages(slide.background.imageUrl, draw)
  }
  for (const el of slide.elements) {
    if (el.type === "image") ensureSlideImages(el.imageUrl, draw)
  }

  cancelAnimationFrame(refs.rafRef.current)
  if (refs.videoRef.current) {
    refs.videoRef.current.pause()
  }

  const startLoop = () => {
    const tick = () => {
      draw()
      refs.rafRef.current = requestAnimationFrame(tick)
    }
    refs.rafRef.current = requestAnimationFrame(tick)
  }

  if (slideHasAnimatedBackground(slide) || slideHasTimer(slide)) {
    startLoop()
  } else if (slideHasVideoBackground(slide)) {
    const url = slide.background.videoUrl!
    const cached = refs.videoCache.get(url)
    if (cached) {
      refs.videoRef.current = cached
      cached.currentTime = 0
      void cached.play()
      startLoop()
    } else {
      const video = document.createElement("video")
      video.muted = true
      video.loop = true
      video.playsInline = true
      video.src = url
      video.onloadeddata = () => {
        refs.videoCache.set(url, video)
        refs.videoRef.current = video
        void video.play()
        startLoop()
      }
      video.load()
    }
  }

  return () => {
    cancelAnimationFrame(refs.rafRef.current)
  }
}
