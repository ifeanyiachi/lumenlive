import { useRef, useEffect, useCallback } from "react"

import {
  renderSlide,
  drawSlideElements,
  slideHasVideo,
  slideHasVideoBackground,
  slideHasAnimatedBackground,
  slideHasTimer,
  sameAnimatedBackground,
  getTextLineCount,
  getTextWordCount,
  type SlideRenderOptions,
} from "@/lib/slide-renderer"
import {
  createSlideAnimationTracker,
  updateAnimationTracker,
  isAnimationActive,
  type SlideAnimationTracker,
} from "@/lib/slide-animation"
import { getSlideImageCache, ensureSlideImages } from "@/lib/slide-image-cache"
import { acquireOffscreenCanvas } from "@/lib/dom/offscreen-canvas"
import { DESIGN_WIDTH, DESIGN_HEIGHT } from "@/lib/canvas-constants"
import { drawTransitionOverlay } from "@/lib/slides/transition-preview"
import { usePresentationStore } from "@/stores/presentation-store"
import type {
  Slide,
  SlideTextElement,
  SlideTransitionType,
} from "@/types/slide"

/**
 * The editor canvas coordinator: owns the single visible `<canvas>` plus every
 * persistent handle its render paths share — the video cache, the animation
 * tracker, the entry-animation / media-playback / transition-preview RAF loops,
 * and the reused offscreen measuring/previous-frame buffers.
 *
 * Consolidating these under one hook is deliberate (Wave 7 S8 Phase 2): the
 * `draw` callback, the entry-animation loop, the media loop, and the transition
 * preview all read and mutate the same refs, so splitting them into separate
 * hooks would mean threading a shared ref bag between them. Keeping one owner is
 * the "unify RAF ownership" goal — each concern still has its own dedicated RAF
 * handle, they just live together. Behaviour is byte-identical to the inline
 * effects this replaces.
 *
 * Returns the canvas ref (bind it to the visible `<canvas>` and pass to the
 * selection overlay) and `handlePreviewTransition` (wire to the slide strip's
 * preview button).
 */
export function useSlideEditorCanvas(
  activeSlide: Slide | null,
  editingTextElementId: string | null
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const editorVideoRef = useRef<HTMLVideoElement | null>(null)
  const editorRafRef = useRef<number>(0)
  const editorVideoUrlsRef = useRef<string[]>([])
  const editorAnimTrackerRef = useRef<SlideAnimationTracker | null>(null)
  const editorAnimRafRef = useRef<number>(0)
  // Persistent offscreen canvases reused across renders instead of allocating a
  // fresh 1920×1080 buffer per slide change / transition (P3).
  const measuringCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const prevFrameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const transitionPreviewRef = useRef<{
    prevCanvas: HTMLCanvasElement
    type: SlideTransitionType
    duration: number
    rafId: number
  } | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeSlide) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = DESIGN_WIDTH
    canvas.height = DESIGN_HEIGHT
    const renderOpts: SlideRenderOptions = {
      frameTime: performance.now(),
      now: Date.now(),
    }
    const tracker = editorAnimTrackerRef.current
    if (tracker && isAnimationActive(tracker)) {
      renderOpts.animationStates = tracker.elementStates
      renderOpts.textBuildProgress = tracker.textBuildProgress
    }
    // While a text element is edited inline, hide its baked copy so the DOM
    // `<textarea>` overlay is the only visible one (no double-vision).
    const slideToRender = editingTextElementId
      ? {
          ...activeSlide,
          elements: activeSlide.elements.map((el) =>
            el.id === editingTextElementId ? { ...el, visible: false } : el
          ),
        }
      : activeSlide
    renderSlide(
      ctx,
      slideToRender,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      getSlideImageCache(),
      videoCacheRef.current,
      renderOpts
    )
  }, [activeSlide, editingTextElementId])

  // Keep a stable handle to the latest draw so the animation loop below can call
  // it without restarting every time draw's identity changes on an edit.
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
  })

  // Replay text-build / entry animations when navigating to a slide, so lyric
  // reveals (fade-up / blur-in) and element entries are visible in the editor
  // preview — not only on the live/broadcast output. Keyed on slide id so
  // content edits to the current slide don't restart the animation.
  useEffect(() => {
    cancelAnimationFrame(editorAnimRafRef.current)
    editorAnimTrackerRef.current = null
    if (!activeSlide) return

    const hasAnimatedElements = activeSlide.elements.some(
      (el) =>
        (el.animation?.entry && el.animation.entry.type !== "none") ||
        (el.type === "text" &&
          (el as SlideTextElement).textBuild &&
          (el as SlideTextElement).textBuild!.type !== "none")
    )
    if (!hasAnimatedElements) return

    const tracker = createSlideAnimationTracker()
    editorAnimTrackerRef.current = tracker

    // Measurement only (no visible pixels) — reuse the buffer, skip the clear.
    const measuringCanvas = acquireOffscreenCanvas(
      measuringCanvasRef,
      DESIGN_WIDTH,
      DESIGN_HEIGHT,
      false
    )
    const mCtx = measuringCanvas.getContext("2d")
    const animInfo = {
      elements: activeSlide.elements.map((el) => ({
        id: el.id,
        animation: el.animation,
        textBuild:
          el.type === "text" ? (el as SlideTextElement).textBuild : undefined,
        textLineCount:
          el.type === "text" && mCtx
            ? getTextLineCount(
                mCtx,
                el as SlideTextElement,
                DESIGN_WIDTH,
                DESIGN_HEIGHT
              )
            : undefined,
        textWordCount:
          el.type === "text"
            ? getTextWordCount(el as SlideTextElement)
            : undefined,
      })),
    }

    // Prime the tracker to its initial (t≈0) state so the first synchronous
    // draw from other effects shows the pre-reveal frame, not a flash of full
    // text before the build starts.
    updateAnimationTracker(tracker, animInfo, performance.now())

    const tick = () => {
      updateAnimationTracker(tracker, animInfo, performance.now())
      drawRef.current()
      if (!tracker.isComplete) {
        editorAnimRafRef.current = requestAnimationFrame(tick)
      }
    }
    editorAnimRafRef.current = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(editorAnimRafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSlide?.id])

  const handlePreviewTransition = useCallback((slideIndex: number) => {
    // Read the draft from the store rather than closing over it, so this callback
    // keeps a stable identity across edits and the memoized SlideThumb holds.
    const draft = usePresentationStore.getState().draftPresentation
    if (!draft || slideIndex < 1) return
    const slide = draft.slides[slideIndex]
    const prevSlide = draft.slides[slideIndex - 1]
    if (!slide.transition || slide.transition.type === "cut") return

    // When both slides share the same animated background, keep it running
    // continuously and cross-fade only the text (snapshot elements onto a
    // transparent canvas); otherwise snapshot the full previous frame.
    const persistBg = sameAnimatedBackground(
      prevSlide.background,
      slide.background
    )

    // Render previous slide to the reused offscreen canvas (cleared first, so
    // the transparent-background path composits over a blank surface).
    const prevCanvas = acquireOffscreenCanvas(
      prevFrameCanvasRef,
      DESIGN_WIDTH,
      DESIGN_HEIGHT
    )
    const prevCtx = prevCanvas.getContext("2d")
    if (!prevCtx) return
    if (persistBg) {
      drawSlideElements(prevCtx, prevSlide, DESIGN_WIDTH, DESIGN_HEIGHT, {
        imageCache: getSlideImageCache(),
      })
    } else {
      renderSlide(
        prevCtx,
        prevSlide,
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
        getSlideImageCache()
      )
    }

    // Switch to the target slide
    usePresentationStore.getState().setActiveSlideIndex(slideIndex)

    if (transitionPreviewRef.current) {
      cancelAnimationFrame(transitionPreviewRef.current.rafId)
    }

    const startTime = performance.now()
    const { type, duration } = slide.transition

    const tick = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Draw current slide first (with a frame clock so a persistent animated
      // background keeps moving through the transition).
      canvas.width = DESIGN_WIDTH
      canvas.height = DESIGN_HEIGHT
      renderSlide(
        ctx,
        slide,
        DESIGN_WIDTH,
        DESIGN_HEIGHT,
        getSlideImageCache(),
        videoCacheRef.current,
        { frameTime: performance.now(), now: Date.now() }
      )

      // Overlay the previous slide with the transition effect.
      drawTransitionOverlay(
        ctx,
        prevCanvas,
        type,
        progress,
        DESIGN_WIDTH,
        DESIGN_HEIGHT
      )

      if (progress < 1) {
        transitionPreviewRef.current = {
          prevCanvas,
          type,
          duration,
          rafId: requestAnimationFrame(tick),
        }
      } else {
        transitionPreviewRef.current = null
      }
    }

    transitionPreviewRef.current = {
      prevCanvas,
      type,
      duration,
      rafId: requestAnimationFrame(tick),
    }
  }, [])

  // Draw on slide/edit change and drive the media / animated-background loop:
  // preload image assets and redraw when they land; (re)start or stop the
  // per-frame video loop as the set of video URLs changes; fall back to a plain
  // animated-background loop when there's no video but a time-driven background.
  useEffect(() => {
    draw()
    if (activeSlide?.background.type === "image") {
      ensureSlideImages(activeSlide.background.imageUrl, draw)
    }
    if (activeSlide) {
      for (const el of activeSlide.elements) {
        if (el.type === "image" && el.imageUrl) {
          ensureSlideImages(el.imageUrl, draw)
        }
      }
    }

    const videoUrls: string[] = []
    if (activeSlide && slideHasVideo(activeSlide)) {
      if (
        slideHasVideoBackground(activeSlide) &&
        activeSlide.background.videoUrl
      ) {
        videoUrls.push(activeSlide.background.videoUrl)
      }
      for (const el of activeSlide.elements) {
        if (el.type === "video" && el.videoUrl) {
          videoUrls.push(el.videoUrl)
        }
      }
    }

    const prevUrls = editorVideoUrlsRef.current
    const urlsChanged =
      videoUrls.length !== prevUrls.length ||
      videoUrls.some((u, i) => u !== prevUrls[i])
    editorVideoUrlsRef.current = videoUrls

    if (urlsChanged) {
      cancelAnimationFrame(editorRafRef.current)
      if (editorVideoRef.current) {
        editorVideoRef.current.pause()
      }
      editorVideoRef.current = null
    }

    if (videoUrls.length > 0) {
      let pendingLoads = 0
      const startLoop = () => {
        if (editorRafRef.current) cancelAnimationFrame(editorRafRef.current)
        const tick = () => {
          draw()
          editorRafRef.current = requestAnimationFrame(tick)
        }
        editorRafRef.current = requestAnimationFrame(tick)
      }

      for (const url of videoUrls) {
        const cached = videoCacheRef.current.get(url)
        if (cached) {
          if (!editorVideoRef.current) editorVideoRef.current = cached
          if (urlsChanged) void cached.play()
        } else {
          pendingLoads++
          const video = document.createElement("video")
          video.muted = true
          video.loop = true
          video.playsInline = true
          video.src = url
          video.onloadeddata = () => {
            videoCacheRef.current.set(url, video)
            if (!editorVideoRef.current) editorVideoRef.current = video
            void video.play()
            pendingLoads--
            if (pendingLoads === 0) startLoop()
          }
          video.load()
        }
      }
      if (pendingLoads === 0) startLoop()
    } else if (
      activeSlide &&
      (slideHasAnimatedBackground(activeSlide) || slideHasTimer(activeSlide))
    ) {
      // No video, but a time-driven animated background or ticking timer element
      // needs a persistent loop.
      cancelAnimationFrame(editorRafRef.current)
      const tick = () => {
        draw()
        editorRafRef.current = requestAnimationFrame(tick)
      }
      editorRafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(editorRafRef.current)
    }

    return () => {
      cancelAnimationFrame(editorRafRef.current)
      if (transitionPreviewRef.current)
        cancelAnimationFrame(transitionPreviewRef.current.rafId)
    }
  }, [draw, activeSlide])

  return { canvasRef, handlePreviewTransition }
}
