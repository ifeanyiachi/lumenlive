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
import { preloadImage } from "@/lib/broadcast-output/asset-cache"
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
    for (const el of slide.elements) {
      if (el.type === "image") {
        preloadImage(
          rt.imageCacheRef.current,
          el.imageUrl,
          () => {
            rt.draw()
            rt.pushNdiBurst()
          },
          "slide element image"
        )
      }
    }

    if (slideHasVideoBackground(slide)) {
      const url = slide.background.videoUrl!
      const cached = rt.videoCacheRef.current.get(url)
      if (cached) {
        cached.currentTime = 0
        void cached.play()
        rt.startSlideVideoLoop()
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
          rt.startSlideVideoLoop()
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

    if (hasTransition && wasSlide) {
      const t = event.payload.slide.transition!
      rt.startTransition(t.type, t.duration)
    } else {
      rt.draw()
      rt.pushNdiBurst()
    }

    // Start element animation loop if any elements have entry animations or text builds
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
            el.type === "text" ? (el as SlideTextElement).textBuild : undefined,
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
  })

  return disposeSubscriptions([unlisten])
}
