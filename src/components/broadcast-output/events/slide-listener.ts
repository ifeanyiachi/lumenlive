/**
 * Slide-update listener: the slide path. Handles the same-animated-background vs
 * full-frame transition snapshot, preloads slide images, starts a background-video
 * loop, runs the transition, and sets up the entry-animation/text-build/scroll
 * loop. Moved verbatim from the output-window effect.
 */

import {
  slideHasVideoBackground,
  slideHasScrollingText,
  slideHasAnimatedBackground,
  slideHasTimer,
  sameAnimatedBackground,
  getTextLineCount,
  getTextWordCount,
} from "@/lib/slide-renderer"
import {
  preloadImage,
  slideBackgroundReady,
  ASSET_REVEAL_FALLBACK_MS,
} from "@/lib/broadcast-output/asset-cache"
import {
  createSlideAnimationTracker,
  updateAnimationTracker,
} from "@/lib/slide-animation"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import type { SlideTextElement } from "@/types/slide"
import type { OutputRuntime } from "../runtime"
import { disposeSubscriptions, type EventDisposer } from "./registrar"

export function registerSlideListener(
  rt: OutputRuntime,
  renderLoop: RenderLoop
): EventDisposer {
  const unlisten = listenOutputEvent(BROADCAST_EVENTS.slideUpdate, (event) => {
    const hasTransition =
      event.payload.slide.transition &&
      event.payload.slide.transition.type !== "cut"
    const wasSlide = rt.activeMode.current === "slide" && rt.latestSlide.current
    const oldSlide = rt.latestSlide.current?.slide

    if (hasTransition && wasSlide) {
      // If the outgoing and incoming slides share the same animated
      // background, keep it running continuously and cross-fade only the
      // text; otherwise fall back to the full-frame cross-fade.
      if (
        oldSlide &&
        sameAnimatedBackground(
          oldSlide.background,
          event.payload.slide.background
        )
      ) {
        rt.snapshotElementsOnly(oldSlide)
      } else {
        rt.snapshotCurrentCanvas()
      }
    }

    rt.latestSlide.current = event.payload
    rt.layerFilterRef.current = event.payload.layerFilter ?? null
    rt.activeMode.current = "slide"
    rt.latestMedia.current = null
    // Leaving verse mode: stop the verse theme's animated-background loop.
    renderLoop.deactivate("themeAnim")
    if (rt.videoRef.current) {
      rt.videoRef.current.pause()
      rt.videoRef.current.src = ""
    }
    if (rt.audioRef.current) {
      rt.audioRef.current.pause()
      rt.audioRef.current.src = ""
    }
    cancelAnimationFrame(rt.videoRafRef.current)
    renderLoop.deactivate("slideVideo")
    rt.logDebug("Received broadcast:slide-update", {
      slideName: event.payload.slide.name,
    })

    const slide = event.payload.slide

    // Start the element/text-build animation loop for the revealed slide. Kept in
    // a closure so it runs at reveal time (below), i.e. the entry stagger begins
    // when the slide actually appears — not while we're still holding for a slow
    // background asset.
    const setupElementAnimationLoop = () => {
      renderLoop.deactivate("slideAnim")
      const hasAnimatedElements = slide.elements.some(
        (el) =>
          (el.animation?.entry && el.animation.entry.type !== "none") ||
          (el.type === "text" &&
            (el as SlideTextElement).textBuild &&
            (el as SlideTextElement).textBuild!.type !== "none")
      )
      const hasScrolling = slideHasScrollingText(slide)
      const hasAnimatedBg = slideHasAnimatedBackground(slide)
      const hasTimer = slideHasTimer(slide)

      if (hasAnimatedElements || hasScrolling || hasAnimatedBg || hasTimer) {
        const tracker = createSlideAnimationTracker()
        rt.slideAnimTracker.current = tracker

        const measuringCanvas = document.createElement("canvas")
        // Measure line counts at the live surface width so text-build reveals
        // match the actual wrapped line count on non-16:9 surfaces.
        const measureSurface = rt.computeSurface()
        measuringCanvas.width = measureSurface.width
        measuringCanvas.height = measureSurface.height
        const mCtx = measuringCanvas.getContext("2d")!

        const animInfo = {
          elements: slide.elements.map((el) => ({
            id: el.id,
            animation: el.animation,
            textBuild:
              el.type === "text"
                ? (el as SlideTextElement).textBuild
                : undefined,
            textLineCount:
              el.type === "text"
                ? getTextLineCount(
                    mCtx,
                    el as SlideTextElement,
                    measureSurface.width,
                    measureSurface.height
                  )
                : undefined,
            textWordCount:
              el.type === "text"
                ? getTextWordCount(el as SlideTextElement)
                : undefined,
          })),
        }

        // Advance the tracker each frame (beforeFrame), draw+push (default),
        // then keep going until the entry animation completes — unless the
        // slide scrolls or has an animated background, which run indefinitely.
        // "after" timing preserves the original's draw-then-decide order.
        renderLoop.activate("slideAnim", {
          beforeFrame: () =>
            updateAnimationTracker(tracker, animInfo, performance.now()),
          keepAlive: () =>
            !tracker.isComplete || hasScrolling || hasAnimatedBg || hasTimer,
          keepAliveTiming: "after",
        })
      } else {
        rt.slideAnimTracker.current = null
      }
    }

    // The verse/slide text paints synchronously, but an image/video background
    // paints black until its asset decodes — on production (assets stream over
    // Tauri's asset protocol) that lag shows text on black, then the background
    // pops in. Gate the reveal (transition/cut + entry animation) on the
    // background being paintable so text and background surface as one unit.
    // `reveal()` runs at most once, and only while this slide is still the active
    // one — a newer push supersedes a slow asset callback or the fallback timer.
    let revealed = false
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    const reveal = () => {
      if (revealed || rt.latestSlide.current !== event.payload) return
      revealed = true
      if (fallbackTimer !== undefined) clearTimeout(fallbackTimer)

      if (slideHasVideoBackground(slide)) rt.startSlideVideoLoop()

      if (hasTransition && wasSlide) {
        const t = event.payload.slide.transition!
        rt.startTransition(t.type, t.duration)
      } else {
        rt.draw()
        rt.pushNdiBurst()
      }

      setupElementAnimationLoop()
    }

    // Decorative image elements load independently; redraw as each arrives — but
    // only once the slide has been revealed, so a landing element never forces a
    // paint of text over a not-yet-ready background (the pop this gate removes).
    for (const el of slide.elements) {
      if (el.type === "image") {
        preloadImage(
          rt.imageCacheRef.current,
          el.imageUrl,
          () => {
            if (!revealed) return
            rt.draw()
            rt.pushNdiBurst()
          },
          "slide element image"
        )
      }
    }

    // Background lifecycle: kick off the video load/play (or pause stale videos).
    if (slideHasVideoBackground(slide)) {
      const url = slide.background.videoUrl!
      const cached = rt.videoCacheRef.current.get(url)
      if (cached) {
        cached.currentTime = 0
        void cached.play()
        // A cached clip is usually buffered; if not, reveal once it can paint.
        if (cached.readyState < 2) {
          cached.addEventListener("loadeddata", () => reveal(), { once: true })
        }
      } else {
        const video = document.createElement("video")
        video.crossOrigin = "anonymous"
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.src = url
        video.onloadeddata = () => {
          rt.videoCacheRef.current.set(url, video)
          void video.play()
          reveal()
        }
        video.load()
      }
    } else {
      for (const [, v] of rt.videoCacheRef.current) {
        v.pause()
      }
      if (
        rt.mediaLayerRef.current?.mediaType === "video" &&
        rt.mediaLayerVideoRef.current
      ) {
        rt.startMediaLayerVideoLoop()
      }
    }

    // Reveal now when the background can already paint — a synchronous type
    // (solid/gradient/animated/transparent) or a warm image/video cache — else
    // arm the async load to reveal once it lands, with a fallback so a slow or
    // broken asset never freezes the previous slide indefinitely.
    if (
      slideBackgroundReady(
        slide,
        rt.imageCacheRef.current,
        rt.videoCacheRef.current
      )
    ) {
      reveal()
    } else {
      if (slide.background.type === "image" && slide.background.imageUrl) {
        preloadImage(
          rt.imageCacheRef.current,
          slide.background.imageUrl,
          reveal,
          "slide background image"
        )
      }
      fallbackTimer = setTimeout(reveal, ASSET_REVEAL_FALLBACK_MS)
    }
  })

  return disposeSubscriptions([unlisten])
}
