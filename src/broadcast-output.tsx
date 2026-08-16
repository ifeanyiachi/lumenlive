import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { OutputWebLayer } from "@/components/broadcast/output-web-layer"
import {
  slideHasVideoBackground,
  slideHasScrollingText,
  slideHasAnimatedBackground,
  sameAnimatedBackground,
  getTextLineCount,
  getTextWordCount,
} from "@/lib/slide-renderer"
import { DEFAULT_MEDIA_FIT, type MediaFitConfig } from "@/lib/media-fit"
import { drawTransitionFrame as paintTransitionFrame } from "@/lib/broadcast-output/overlays"
import {
  composeFrame,
  composeNdiForeground,
  type CompositorState,
} from "@/lib/broadcast-output/compositor"
import {
  snapshotCanvas,
  snapshotSlideElements,
} from "@/lib/broadcast-output/transitions"
import {
  preloadImage,
  preloadThemeAssets,
} from "@/lib/broadcast-output/asset-cache"
import { captureAndSendNdiFrame } from "@/lib/broadcast-output/ndi-push"
import {
  createRenderLoop,
  type RenderLoop,
} from "@/lib/broadcast-output/render-loop"
import { toFitConfig, shouldPushNdiFrame } from "@/lib/broadcast-output/frame"
import {
  resolveSurface,
  resolvePreviewObjectFit,
  type Surface,
  type ResolvedSurface,
} from "@/lib/broadcast-output/surface"
import { shouldSendTransparentNdi } from "@/lib/broadcast-output/ndi-key"
import { sendNdiFrame, getNdiStatus } from "@/services/ndi-output-gateway"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
  emitMediaProgress as sendMediaProgress,
  emitMediaEnded as sendMediaEnded,
  emitOutputReady as sendOutputReady,
  type VerseUpdatePayload,
  type SlideUpdatePayload,
} from "@/services/broadcast-content-gateway"
import type { StageDisplayData } from "@/lib/stage-display-renderer"
import {
  createSlideAnimationTracker,
  updateAnimationTracker,
} from "@/lib/slide-animation"
import type { SlideAnimationTracker } from "@/lib/slide-animation"
import type {
  BroadcastTheme,
  LayerFilter,
  OutputDisplayMode,
  BroadcastProp,
  MediaLayerState,
} from "@/types/broadcast"
import type {
  Slide,
  SlideTransitionType,
  SlideTextElement,
} from "@/types/slide"
import type {
  AlertTemplate,
  ActiveAlert,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { NdiConfigEventPayload } from "@/types"

/** Read output config from URL hash fragment (#output=main&mode=normal). Defaults to "main"/"normal". */
const _hashParams = new URLSearchParams(window.location.hash.slice(1))
const OUTPUT_ID = _hashParams.get("output") ?? "main"
const OUTPUT_MODE = _hashParams.get("mode") ?? "normal"

// Cross-window payload shapes now live in the broadcast-content gateway (the
// shared contract, compiler-enforced on both ends). Aliased here for the refs
// that cache the latest received payload; every listener below is typed by
// `listenOutputEvent`.
type BroadcastPayload = VerseUpdatePayload
type SlidePayload = SlideUpdatePayload

// This is a window entry point (defines the component and calls createRoot at
// the bottom), so it is not a Fast Refresh module boundary.
// eslint-disable-next-line react-refresh/only-export-components
function BroadcastCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const latestData = useRef<BroadcastPayload | null>(null)
  const latestSlide = useRef<SlidePayload | null>(null)
  const latestMedia = useRef<{ img: HTMLImageElement } | null>(null)
  // The active per-output layer filter, kept in sync by every content handler
  // (verse/slide/media) so overlay/content gating is correct in all live modes,
  // not just verse mode. `null` means "no filter — show everything".
  const layerFilterRef = useRef<LayerFilter | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRafRef = useRef<number>(0)
  const mediaConfigRef = useRef<{
    trimStart: number
    trimEnd?: number
    loop: boolean
    endAction: "hold" | "stop" | "loop" | "next"
  } | null>(null)
  const mediaBlankRef = useRef(false)
  // Live-output visibility (Black / Clear). Blackout paints the
  // whole frame black after everything else; clearForeground hides the scripture/
  // slide text while keeping the background. Both are pushed from the store.
  const blackoutRef = useRef(false)
  const clearForegroundRef = useRef(false)
  // Holding-logo state: whether it's showing, its source path, and the loaded
  // image. Drawn full-screen over content (but under Black).
  const showLogoRef = useRef(false)
  const logoPathRef = useRef<string | null>(null)
  const logoImgRef = useRef<HTMLImageElement | null>(null)
  // Central base/master theme: the backdrop revealed on Clear and composited
  // behind transparent content. Delivered via broadcast:base-theme.
  const baseThemeRef = useRef<BroadcastTheme | null>(null)
  const mediaKindRef = useRef<"image" | "video" | "audio" | null>(null)
  const mediaFitRef = useRef<MediaFitConfig>(DEFAULT_MEDIA_FIT)
  const activeAlerts = useRef<
    { alert: ActiveAlert; template: AlertTemplate }[]
  >([])
  const activeCountdowns = useRef<
    {
      countdown: ActiveCountdown
      timer: CountdownTimer
      theme?: BroadcastTheme
    }[]
  >([])
  const activeProps = useRef<BroadcastProp[]>([])
  const activeMode = useRef<"verse" | "slide" | "media">("verse")
  const slideAnimTracker = useRef<SlideAnimationTracker | null>(null)
  const mediaLayerRef = useRef<MediaLayerState | null>(null)
  const mediaLayerImgRef = useRef<HTMLImageElement | null>(null)
  const mediaLayerVideoRef = useRef<HTMLVideoElement | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const prevCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const transitionRef = useRef<{
    type: SlideTransitionType
    duration: number
    startTime: number
    rafId: number
  } | null>(null)
  const ndiConfigRef = useRef<NdiConfigEventPayload>({
    active: false,
    fps: 24,
    width: 1920,
    height: 1080,
    alphaMode: "noneOpaque",
  })
  const ndiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  // The output window's real inner size in device px (native-mode surface).
  const windowSizeRef = useRef<Surface | null>(null)
  // How this output should size its surface. Sent by the main app via
  // `broadcast:display-config`; defaults to native until the first message.
  const displayConfigRef = useRef<{
    displayMode: OutputDisplayMode
    customResolution: Surface | null
    customFit: "contain" | "cover"
    verseAutoFit: boolean
    maxVerseScale: number
    minVerseFontSize: number
  }>({
    displayMode: "native",
    customResolution: null,
    customFit: "contain",
    verseAutoFit: true,
    maxVerseScale: 1.5,
    minVerseFontSize: 40,
  })
  const lastPushRef = useRef(0)
  const pushingRef = useRef(false)
  const broadcastMutedRef = useRef(false)
  const stageDataRef = useRef<StageDisplayData | null>(null)
  const stageClockRafRef = useRef<number>(0)

  const logDebug = useCallback((message: string, meta?: unknown) => {
    if (!import.meta.env.DEV) return
    if (meta === undefined) {
      console.debug(`[broadcast-output] ${message}`)
      return
    }
    console.debug(`[broadcast-output] ${message}`, meta)
  }, [])

  // The pixel dimensions this output renders at. NDI (when active) wins so the
  // feed is never distorted; otherwise a custom resolution, else the real window
  // size (native reflow), else the 1920×1080 fallback. Reads live refs, so it's
  // stable and always reflects the latest window/NDI/display-config state.
  const computeSurface = useCallback((): ResolvedSurface => {
    const cfg = displayConfigRef.current
    return resolveSurface({
      displayMode: cfg.displayMode,
      window: windowSizeRef.current,
      custom: cfg.customResolution,
      ndi: ndiConfigRef.current.active
        ? {
            width: ndiConfigRef.current.width,
            height: ndiConfigRef.current.height,
          }
        : null,
    })
  }, [])

  // Build the read-only snapshot the compositor paints from. Reads every live
  // ref at draw time; the compositor never reaches back for state, so this is
  // the single place refs → compositor. `frameTime`/`now` are injected here so
  // the compositor stays deterministic (and golden-frame testable).
  const readCompositorState = useCallback(
    (): CompositorState => ({
      outputMode: OUTPUT_MODE,
      stageData: stageDataRef.current,
      imageCache: imageCacheRef.current,
      videoCache: videoCacheRef.current,
      layerFilter: layerFilterRef.current,
      clearForeground: clearForegroundRef.current,
      activeMode: activeMode.current,
      latestData: latestData.current,
      latestSlide: latestSlide.current,
      latestMedia: latestMedia.current,
      mediaBlank: mediaBlankRef.current,
      mediaVideo: videoRef.current,
      mediaFit: mediaFitRef.current,
      slideAnimTracker: slideAnimTracker.current,
      baseTheme: baseThemeRef.current,
      mediaLayer: mediaLayerRef.current,
      mediaLayerImg: mediaLayerImgRef.current,
      mediaLayerVideo: mediaLayerVideoRef.current,
      props: activeProps.current,
      alerts: activeAlerts.current,
      countdowns: activeCountdowns.current,
      showLogo: showLogoRef.current,
      logoImg: logoImgRef.current,
      blackout: blackoutRef.current,
      verseAutoFit: displayConfigRef.current.verseAutoFit,
      maxVerseScale: displayConfigRef.current.maxVerseScale,
      minVerseFontSize: displayConfigRef.current.minVerseFontSize,
      frameTime: performance.now(),
      now: Date.now(),
      onNullVerse: () =>
        logDebug("renderVerse returned null; drew fallback frame"),
    }),
    [logDebug]
  )

  const snapshotCurrentCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!prevCanvasRef.current) {
      prevCanvasRef.current = document.createElement("canvas")
    }
    snapshotCanvas(prevCanvasRef.current, canvas)
  }, [])

  // Snapshot only the outgoing slide's ELEMENTS onto a transparent canvas — used
  // when the incoming slide shares the same animated background. The transition
  // then draws one continuous live background (via draw()) and fades out just the
  // old text over it, instead of cross-fading two frozen backgrounds (a ghost).
  const snapshotElementsOnly = useCallback(
    (slide: Slide) => {
      if (!prevCanvasRef.current) {
        prevCanvasRef.current = document.createElement("canvas")
      }
      // Snapshot at the live surface size so the transition blends against a
      // same-sized current frame (no scale/ghost on non-16:9 surfaces).
      const { width: sw, height: sh } = computeSurface()
      snapshotSlideElements(prevCanvasRef.current, slide, sw, sh, {
        imageCache: imageCacheRef.current,
        videoCache: videoCacheRef.current,
      })
    },
    [computeSurface]
  )

  const drawTransitionFrame = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      progress: number,
      type: SlideTransitionType
    ) => {
      paintTransitionFrame(ctx, w, h, progress, type, prevCanvasRef.current)
    },
    []
  )

  const drawRef = useRef<() => void>(() => {})
  const pushNdiFrameRef = useRef<(force?: boolean) => Promise<void>>(
    async () => {}
  )

  // One RAF scheduler for every animation driver (slide/media-layer video, slide
  // entry animation, marquee, countdown, animated verse theme, video base
  // background). The instance is created in the main effect (below) and held here
  // so the render-scope loop starters can reach it; reasons are (de)activated by
  // the listeners. The loop draws at most once per frame and pushes NDI iff any
  // active reason wants it.
  const renderLoopRef = useRef<RenderLoop | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Resolve the render surface for this output (native monitor / custom / NDI).
    // NDI wins while active so the feed is never distorted (surface.ts §7). Every
    // compositor branch renders at this size, so size the canvas once here (which
    // also clears it) before handing off — byte-identical to the old per-branch
    // sizing that every path performed first.
    const surface = computeSurface()
    const previewFit = resolvePreviewObjectFit(
      surface.source,
      displayConfigRef.current.customFit
    )
    const sw = surface.width
    const sh = surface.height
    canvas.style.objectFit = previewFit
    canvas.width = sw
    canvas.height = sh

    composeFrame(ctx, sw, sh, readCompositorState())
  }, [computeSurface, readCompositorState])

  const preloadThemeImages = useCallback(
    (theme: BroadcastTheme) => {
      preloadThemeAssets(theme, imageCacheRef.current, draw)
    },
    [draw]
  )

  // Render ONLY the foreground graphics (verse text / slide elements + overlays)
  // onto a transparent canvas, for a see-through (keyable) NDI feed. Deliberately
  // omits the black floor, the central base theme, and the media layer that the
  // opaque program draws — those are the backdrop a downstream switcher supplies.
  // Only ever called when `shouldSendTransparentNdi` says the content qualifies.
  const drawNdiForeground = useCallback(
    (ctx: CanvasRenderingContext2D, sw: number, sh: number) => {
      composeNdiForeground(ctx, sw, sh, readCompositorState())
    },
    [readCompositorState]
  )

  const pushNdiFrame = useCallback(
    async (force = false) => {
      if (!ndiConfigRef.current.active) return
      if (pushingRef.current) return // back-pressure: skip if already pushing

      // Rate-limit continuous (RAF-driven) pushes to the configured NDI fps.
      if (
        !shouldPushNdiFrame(
          Date.now(),
          lastPushRef.current,
          ndiConfigRef.current.fps,
          force
        )
      )
        return

      pushingRef.current = true
      try {
        const targetWidth = ndiConfigRef.current.width
        const targetHeight = ndiConfigRef.current.height

        // See-through (keyable) path: when the operator picked "transparent
        // background" AND the live content actually has a transparent background,
        // render foreground-only onto a fresh transparent canvas and ship that,
        // instead of copying the opaque preview. The opaque path below is left
        // byte-identical for every other case.
        const keyed =
          OUTPUT_MODE !== "stage" &&
          shouldSendTransparentNdi({
            alphaMode: ndiConfigRef.current.alphaMode ?? "noneOpaque",
            blackout: blackoutRef.current,
            showLogo: showLogoRef.current,
            clearForeground: clearForegroundRef.current,
            mode: activeMode.current,
            backgroundType:
              activeMode.current === "slide"
                ? latestSlide.current?.slide.background.type
                : activeMode.current === "verse"
                  ? latestData.current?.theme.background.type
                  : undefined,
            hasOpaqueBaseTheme:
              activeMode.current === "verse" &&
              !!baseThemeRef.current &&
              !!latestData.current &&
              baseThemeRef.current.id !== latestData.current.theme.id,
            hasMediaLayer:
              mediaLayerRef.current !== null &&
              (!layerFilterRef.current ||
                layerFilterRef.current.showMediaLayer),
          })

        const sent = await captureAndSendNdiFrame({
          targetWidth,
          targetHeight,
          keyed,
          drawForeground: drawNdiForeground,
          sourceCanvas: canvasRef.current,
          scratch: ndiCanvasRef,
          send: (buffer, width, height) =>
            sendNdiFrame(OUTPUT_ID, buffer, width, height),
        })
        if (sent) lastPushRef.current = Date.now()
      } catch (error) {
        console.warn("[broadcast-output] push_ndi_frame failed", error)
      } finally {
        pushingRef.current = false
      }
    },
    [drawNdiForeground]
  )

  /** Push a burst of 3 frames after content changes (NDI receivers need a few frames to sync) */
  const pushNdiBurst = useCallback(() => {
    void pushNdiFrame(true)
    setTimeout(() => void pushNdiFrame(true), 150)
    setTimeout(() => void pushNdiFrame(true), 300)
  }, [pushNdiFrame])

  const startSlideVideoLoop = useCallback(() => {
    // Runs while a slide-background video is live; self-stops on leaving slide mode.
    renderLoopRef.current?.activate("slideVideo", {
      keepAlive: () => activeMode.current === "slide",
    })
  }, [])

  const startMediaLayerVideoLoop = useCallback(() => {
    // Runs until the media layer changes/clears (deactivated by that listener).
    renderLoopRef.current?.activate("mediaLayer")
  }, [])

  // Keep drawRef/pushNdiFrameRef current without writing during render; they are
  // read only from the render-loop's frame callback (after commit).
  useEffect(() => {
    drawRef.current = draw
    pushNdiFrameRef.current = pushNdiFrame
  })

  const startTransition = useCallback(
    (type: SlideTransitionType, duration: number) => {
      if (transitionRef.current) {
        cancelAnimationFrame(transitionRef.current.rafId)
      }

      const startTime = performance.now()
      const tick = () => {
        const elapsed = performance.now() - startTime
        const progress = Math.min(elapsed / duration, 1)

        drawRef.current()

        const canvas = canvasRef.current
        if (canvas) {
          const ctx = canvas.getContext("2d")
          if (ctx)
            drawTransitionFrame(
              ctx,
              canvas.width,
              canvas.height,
              progress,
              type
            )
        }

        void pushNdiFrame()

        if (progress < 1) {
          transitionRef.current = {
            type,
            duration,
            startTime,
            rafId: requestAnimationFrame(tick),
          }
        } else {
          transitionRef.current = null
          drawRef.current()
          pushNdiBurst()
        }
      }

      transitionRef.current = {
        type,
        duration,
        startTime,
        rafId: requestAnimationFrame(tick),
      }
    },
    [drawTransitionFrame, pushNdiFrame, pushNdiBurst]
  )

  useEffect(() => {
    // Set initial canvas size
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 1920
      canvas.height = 1080
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, 1920, 1080)
      }
    }

    // Create the single render loop for this listener lifetime and publish it to
    // the ref the render-scope loop starters read. The frame callback reads
    // `draw`/`push` through refs (kept current after commit), so a fresh `draw`
    // identity doesn't need a new loop.
    const renderLoop = createRenderLoop({
      onFrame: (shouldPush) => {
        drawRef.current()
        if (shouldPush) void pushNdiFrameRef.current()
      },
    })
    renderLoopRef.current = renderLoop

    const currentWindow = getCurrentWebviewWindow()
    logDebug("Listener registration started", { label: currentWindow.label })

    // --- Live media video transport helpers (seek / trim / loop / end-action) ---
    // Only the primary output echoes playback position back to the control
    // window so the operator's scrubber can track the true output position.
    let lastProgressTs = 0
    const emitMediaProgress = (force = false) => {
      if (OUTPUT_ID !== "main") return
      const kind = mediaKindRef.current
      const el =
        kind === "video"
          ? videoRef.current
          : kind === "audio"
            ? audioRef.current
            : null
      if (!el) return
      const now = Date.now()
      if (!force && now - lastProgressTs < 250) return
      lastProgressTs = now
      sendMediaProgress({
        position: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        playing: !el.paused && !el.ended,
        ended: el.ended,
      })
    }

    // Mutually recursive, so declared as hoisted functions.
    function runMediaVideoLoop() {
      cancelAnimationFrame(videoRafRef.current)
      const video = videoRef.current
      if (!video) return
      const tick = () => {
        if (activeMode.current !== "media") return
        const cfg = mediaConfigRef.current
        if (cfg?.trimEnd != null && video.currentTime >= cfg.trimEnd) {
          handleMediaVideoEnd()
          return
        }
        if (video.paused || video.ended) return
        draw()
        void pushNdiFrame()
        emitMediaProgress()
        videoRafRef.current = requestAnimationFrame(tick)
      }
      videoRafRef.current = requestAnimationFrame(tick)
    }

    function handleMediaVideoEnd() {
      const video = videoRef.current
      const cfg = mediaConfigRef.current
      if (!video) return
      cancelAnimationFrame(videoRafRef.current)
      const start = cfg?.trimStart ?? 0
      if (cfg?.loop || cfg?.endAction === "loop") {
        try {
          video.currentTime = start
        } catch {
          /* not seekable yet */
        }
        void video.play()
        runMediaVideoLoop()
        return
      }
      if (cfg?.endAction === "stop") {
        video.pause()
        mediaBlankRef.current = true
        draw()
        pushNdiBurst()
        emitMediaProgress(true)
        return
      }
      // "hold" (default) and "next": freeze on the last visible frame
      video.pause()
      draw()
      pushNdiBurst()
      emitMediaProgress(true)
      if (cfg?.endAction === "next") {
        sendMediaEnded()
      }
    }

    const unlisten = listenOutputEvent(
      BROADCAST_EVENTS.verseUpdate,
      (event) => {
        latestData.current = event.payload
        layerFilterRef.current = event.payload.layerFilter ?? null
        activeMode.current = "verse"
        latestSlide.current = null
        latestMedia.current = null
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ""
        }
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ""
        }
        cancelAnimationFrame(videoRafRef.current)
        renderLoop.deactivate("slideVideo")
        for (const [, v] of videoCacheRef.current) {
          v.pause()
        }
        preloadThemeImages(event.payload.theme)
        logDebug("Received broadcast:verse-update", {
          hasVerse: Boolean(event.payload.verse),
          themeId: event.payload.theme.id,
        })
        // A procedural animated background is clock-driven, so it needs a
        // per-frame redraw (draw-only — it never pushed NDI on its own); static
        // backgrounds don't. Start/stop accordingly.
        renderLoop.deactivate("themeAnim")
        if (event.payload.theme.background.type === "animated") {
          renderLoop.activate("themeAnim", { push: false })
        }
        draw()
        pushNdiBurst()
        if (
          mediaLayerRef.current?.mediaType === "video" &&
          mediaLayerVideoRef.current
        ) {
          startMediaLayerVideoLoop()
        }
      }
    )

    const unlistenSlide = listenOutputEvent(
      BROADCAST_EVENTS.slideUpdate,
      (event) => {
        const hasTransition =
          event.payload.slide.transition &&
          event.payload.slide.transition.type !== "cut"
        const wasSlide = activeMode.current === "slide" && latestSlide.current
        const oldSlide = latestSlide.current?.slide

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
            snapshotElementsOnly(oldSlide)
          } else {
            snapshotCurrentCanvas()
          }
        }

        latestSlide.current = event.payload
        layerFilterRef.current = event.payload.layerFilter ?? null
        activeMode.current = "slide"
        latestMedia.current = null
        // Leaving verse mode: stop the verse theme's animated-background loop.
        renderLoop.deactivate("themeAnim")
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ""
        }
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ""
        }
        cancelAnimationFrame(videoRafRef.current)
        renderLoop.deactivate("slideVideo")
        logDebug("Received broadcast:slide-update", {
          slideName: event.payload.slide.name,
        })

        const slide = event.payload.slide
        for (const el of slide.elements) {
          if (el.type === "image") {
            preloadImage(
              imageCacheRef.current,
              el.imageUrl,
              () => {
                draw()
                pushNdiBurst()
              },
              "slide element image"
            )
          }
        }

        if (slideHasVideoBackground(slide)) {
          const url = slide.background.videoUrl!
          const cached = videoCacheRef.current.get(url)
          if (cached) {
            cached.currentTime = 0
            void cached.play()
            startSlideVideoLoop()
          } else {
            const video = document.createElement("video")
            video.crossOrigin = "anonymous"
            video.muted = true
            video.loop = true
            video.playsInline = true
            video.src = url
            video.onloadeddata = () => {
              videoCacheRef.current.set(url, video)
              void video.play()
              startSlideVideoLoop()
            }
            video.load()
          }
        } else {
          for (const [, v] of videoCacheRef.current) {
            v.pause()
          }
          if (
            mediaLayerRef.current?.mediaType === "video" &&
            mediaLayerVideoRef.current
          ) {
            startMediaLayerVideoLoop()
          }
        }

        if (hasTransition && wasSlide) {
          const t = event.payload.slide.transition!
          startTransition(t.type, t.duration)
        } else {
          draw()
          pushNdiBurst()
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

        if (hasAnimatedElements || hasScrolling || hasAnimatedBg) {
          const tracker = createSlideAnimationTracker()
          slideAnimTracker.current = tracker

          const measuringCanvas = document.createElement("canvas")
          // Measure line counts at the live surface width so text-build reveals
          // match the actual wrapped line count on non-16:9 surfaces.
          const measureSurface = computeSurface()
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
              !tracker.isComplete || hasScrolling || hasAnimatedBg,
            keepAliveTiming: "after",
          })
        } else {
          slideAnimTracker.current = null
        }
      }
    )

    const unlistenMedia = listenOutputEvent(
      BROADCAST_EVENTS.mediaUpdate,
      (event) => {
        const { filePath, mediaType, name } = event.payload
        const src = safeFileSrc(filePath)
        logDebug("Received broadcast:media-update", { name, mediaType })

        latestData.current = null
        latestSlide.current = null
        latestMedia.current = null
        layerFilterRef.current = event.payload.layerFilter ?? null
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ""
        }
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ""
        }
        cancelAnimationFrame(videoRafRef.current)
        renderLoop.deactivate("slideVideo")
        for (const [, v] of videoCacheRef.current) {
          v.pause()
        }
        activeMode.current = "media"
        // Leaving verse mode: stop the verse theme's animated-background loop.
        renderLoop.deactivate("themeAnim")

        mediaKindRef.current = mediaType
        mediaFitRef.current = toFitConfig(event.payload)

        if (mediaType === "image") {
          const img = new Image()
          img.crossOrigin = "anonymous"
          img.onload = () => {
            latestMedia.current = { img }
            draw()
            pushNdiBurst()
          }
          img.onerror = () =>
            console.warn("[broadcast-output] failed to load media image", {
              src,
            })
          img.src = src
        } else if (mediaType === "audio") {
          mediaBlankRef.current = false
          if (!audioRef.current) {
            audioRef.current = document.createElement("audio")
          }
          const audio = audioRef.current
          audio.muted = broadcastMutedRef.current
          audio.loop = false
          mediaConfigRef.current = {
            trimStart: event.payload.trimStart ?? 0,
            trimEnd: event.payload.trimEnd,
            loop: event.payload.loop ?? false,
            endAction: event.payload.endAction ?? "hold",
          }
          audio.src = src
          audio.onloadedmetadata = () => {
            const startAt = mediaConfigRef.current?.trimStart ?? 0
            if (startAt > 0) {
              try {
                audio.currentTime = startAt
              } catch {
                /* not seekable yet */
              }
            }
          }
          audio.onloadeddata = () => {
            // Cue paused: playback starts only when the operator presses Play
            // (forwarded here as a "play" transport). Nothing auto-plays on air.
            emitMediaProgress(true)
          }
          audio.ontimeupdate = () => {
            const cfg = mediaConfigRef.current
            if (cfg?.trimEnd != null && audio.currentTime >= cfg.trimEnd) {
              if (cfg.loop || cfg.endAction === "loop") {
                try {
                  audio.currentTime = cfg.trimStart
                } catch {
                  /* not seekable */
                }
              } else {
                audio.pause()
              }
            }
            emitMediaProgress()
          }
          audio.onended = () => {
            const cfg = mediaConfigRef.current
            if (cfg?.loop || cfg?.endAction === "loop") {
              try {
                audio.currentTime = cfg.trimStart ?? 0
              } catch {
                /* not seekable */
              }
              void audio.play()
            } else if (cfg?.endAction === "next") {
              sendMediaEnded()
            }
            emitMediaProgress(true)
          }
          audio.load()
          draw()
          pushNdiBurst()
        } else {
          mediaBlankRef.current = false
          if (!videoRef.current) {
            videoRef.current = document.createElement("video")
            videoRef.current.crossOrigin = "anonymous"
            videoRef.current.playsInline = true
          }
          const video = videoRef.current
          video.muted = broadcastMutedRef.current
          video.loop = false
          mediaConfigRef.current = {
            trimStart: event.payload.trimStart ?? 0,
            trimEnd: event.payload.trimEnd,
            loop: event.payload.loop ?? false,
            endAction: event.payload.endAction ?? "hold",
          }
          video.src = src
          video.onloadedmetadata = () => {
            const startAt = mediaConfigRef.current?.trimStart ?? 0
            if (startAt > 0) {
              try {
                video.currentTime = startAt
              } catch {
                /* not seekable yet */
              }
            }
          }
          video.onloadeddata = () => {
            // Cue paused on the first frame: draw it so the audience sees the
            // still, but don't start playback. The operator's Play (a "play"
            // transport) starts booth + audience together. Nothing auto-plays.
            draw()
            pushNdiBurst()
            emitMediaProgress(true)
          }
          video.onended = () => {
            handleMediaVideoEnd()
          }
          video.load()
        }
      }
    )

    const unlistenMediaFit = listenOutputEvent(
      BROADCAST_EVENTS.mediaFitUpdate,
      (event) => {
        if (activeMode.current !== "media") return
        mediaFitRef.current = toFitConfig(event.payload)
        draw()
        pushNdiBurst()
      }
    )

    const unlistenTransport = listenOutputEvent(
      BROADCAST_EVENTS.mediaTransport,
      (event) => {
        if (activeMode.current !== "media") return
        const kind = mediaKindRef.current
        if (kind !== "video" && kind !== "audio") return
        const isVideo = kind === "video"
        const el: HTMLMediaElement | null = isVideo
          ? videoRef.current
          : audioRef.current
        if (!el) return
        const { action, position } = event.payload

        if (action === "play") {
          mediaBlankRef.current = false
          void el.play()
          if (isVideo) runMediaVideoLoop()
        } else if (action === "pause") {
          el.pause()
          if (isVideo) {
            cancelAnimationFrame(videoRafRef.current)
            draw()
            pushNdiBurst()
          }
        } else if (action === "seek" && position != null) {
          mediaBlankRef.current = false
          try {
            el.currentTime = position
          } catch {
            /* not seekable yet */
          }
          if (isVideo) {
            draw()
            pushNdiBurst()
            if (!el.paused) runMediaVideoLoop()
          }
        }
        emitMediaProgress(true)
      }
    )

    const unlistenAlert = listenOutputEvent(BROADCAST_EVENTS.alert, (event) => {
      activeAlerts.current = [...activeAlerts.current, event.payload]
      logDebug("Received broadcast:alert", {
        message: event.payload.alert.message,
      })
      draw()
      pushNdiBurst()
    })

    const unlistenAlertDismiss = listenOutputEvent(
      BROADCAST_EVENTS.alertDismiss,
      (event) => {
        activeAlerts.current = activeAlerts.current.filter(
          (a) => a.alert.id !== event.payload.alertId
        )
        logDebug("Received broadcast:alert-dismiss", {
          alertId: event.payload.alertId,
        })
        draw()
        pushNdiBurst()
      }
    )

    const unlistenAlertDismissAll = listenOutputEvent(
      BROADCAST_EVENTS.alertDismissAll,
      () => {
        activeAlerts.current = []
        logDebug("Received broadcast:alert-dismiss-all")
        draw()
        pushNdiBurst()
      }
    )

    // A countdown re-renders every frame (the time text changes), so the render
    // loop runs a "countdown" reason while any countdown is active; its keepAlive
    // self-stops (before the frame) once the set empties — the same shape as the
    // marquee ticker.
    const ensureCountdownLoop = () => {
      if (activeCountdowns.current.length > 0) {
        renderLoop.activate("countdown", {
          keepAlive: () => activeCountdowns.current.length > 0,
        })
      } else {
        renderLoop.deactivate("countdown")
      }
    }

    const unlistenCountdown = listenOutputEvent(
      BROADCAST_EVENTS.countdown,
      (event) => {
        activeCountdowns.current = [...activeCountdowns.current, event.payload]
        logDebug("Received broadcast:countdown", {
          label: event.payload.timer.label,
        })
        ensureCountdownLoop()
      }
    )

    // Pause/resume/±time all arrive as a full-state replace for one countdown.
    const unlistenCountdownUpdate = listenOutputEvent(
      BROADCAST_EVENTS.countdownUpdate,
      (event) => {
        activeCountdowns.current = activeCountdowns.current.map((c) =>
          c.countdown.id === event.payload.countdown.id ? event.payload : c
        )
        logDebug("Received broadcast:countdown-update", {
          label: event.payload.timer.label,
          state: event.payload.countdown.state,
        })
        ensureCountdownLoop()
      }
    )

    // Full replace of the active set — sent when this window (re)announces
    // readiness so a countdown that started before it opened still appears.
    // Replace (not append) keeps already-synced windows from doubling entries.
    const unlistenCountdownSync = listenOutputEvent(
      BROADCAST_EVENTS.countdownSync,
      (event) => {
        activeCountdowns.current = event.payload.items
        logDebug("Received broadcast:countdown-sync", {
          count: event.payload.items.length,
        })
        ensureCountdownLoop()
      }
    )

    const unlistenCountdownDismiss = listenOutputEvent(
      BROADCAST_EVENTS.countdownDismiss,
      (event) => {
        activeCountdowns.current = activeCountdowns.current.filter(
          (c) => c.countdown.id !== event.payload.countdownId
        )
        logDebug("Received broadcast:countdown-dismiss", {
          countdownId: event.payload.countdownId,
        })
        draw()
        pushNdiBurst()
      }
    )

    const unlistenCountdownDismissAll = listenOutputEvent(
      BROADCAST_EVENTS.countdownDismissAll,
      () => {
        activeCountdowns.current = []
        logDebug("Received broadcast:countdown-dismiss-all")
        draw()
        pushNdiBurst()
      }
    )

    const unlistenProps = listenOutputEvent(
      BROADCAST_EVENTS.propsUpdate,
      (event) => {
        activeProps.current = event.payload.props
        logDebug("Received broadcast:props-update", {
          count: event.payload.props.length,
        })
        for (const prop of event.payload.props) {
          if (prop.type === "image") {
            preloadImage(
              imageCacheRef.current,
              prop.imageUrl,
              () => {
                draw()
                pushNdiBurst()
              },
              "prop image"
            )
          }
        }
        draw()
        pushNdiBurst()

        // A marquee scrolls every frame, so run a "marquee" render-loop reason
        // while any active prop is a marquee (mirrors the countdown ticker); its
        // keepAlive self-stops (before the frame) once none remain.
        if (activeProps.current.some((p) => p.type === "marquee")) {
          renderLoop.activate("marquee", {
            keepAlive: () =>
              activeProps.current.some((p) => p.type === "marquee"),
          })
        } else {
          renderLoop.deactivate("marquee")
        }
      }
    )

    const unlistenMediaLayer = listenOutputEvent(
      BROADCAST_EVENTS.mediaLayerUpdate,
      (event) => {
        const { layer } = event.payload
        logDebug("Received broadcast:media-layer-update", {
          layer: layer?.name ?? null,
        })

        renderLoop.deactivate("mediaLayer")
        if (mediaLayerVideoRef.current) {
          mediaLayerVideoRef.current.pause()
          mediaLayerVideoRef.current.src = ""
        }
        mediaLayerImgRef.current = null
        mediaLayerRef.current = layer

        if (!layer) {
          draw()
          pushNdiBurst()
          return
        }

        const src = safeFileSrc(layer.filePath)

        if (layer.mediaType === "image") {
          const img = new Image()
          img.crossOrigin = "anonymous"
          img.onload = () => {
            mediaLayerImgRef.current = img
            draw()
            pushNdiBurst()
          }
          img.src = src
        } else {
          const video = document.createElement("video")
          video.crossOrigin = "anonymous"
          video.muted = true
          video.loop = true
          video.playsInline = true
          video.src = src
          video.onloadeddata = () => {
            mediaLayerVideoRef.current = video
            void video.play()
            startMediaLayerVideoLoop()
          }
          video.load()
        }
      }
    )

    const unlistenStage = listenOutputEvent(
      BROADCAST_EVENTS.stageUpdate,
      (event) => {
        stageDataRef.current = event.payload
        logDebug("Received broadcast:stage-update")
        if (OUTPUT_MODE === "stage") {
          draw()
          pushNdiBurst()
        }
      }
    )

    const unlistenMute = listenOutputEvent(BROADCAST_EVENTS.mute, (event) => {
      broadcastMutedRef.current = event.payload.muted
      if (videoRef.current) {
        videoRef.current.muted = event.payload.muted
      }
      if (audioRef.current) {
        audioRef.current.muted = event.payload.muted
      }
      logDebug("Received broadcast:mute", { muted: event.payload.muted })
    })

    // Live-output visibility (Black / Clear / Logo). Stash into refs and repaint;
    // push a short NDI burst so the feed reflects the change even when idle. The
    // logo image is loaded lazily and only when its path changes.
    const unlistenVisibility = listenOutputEvent(
      BROADCAST_EVENTS.outputVisibility,
      (event) => {
        blackoutRef.current = event.payload.blackout
        clearForegroundRef.current = event.payload.clear
        showLogoRef.current = event.payload.logo
        const path = event.payload.logoImagePath
        if (path !== logoPathRef.current) {
          logoPathRef.current = path
          logoImgRef.current = null
          if (path) {
            const img = new Image()
            // Load CORS-clean so the logo doesn't taint the canvas. The projector
            // displays a tainted canvas fine, but NDI reads it back via
            // getImageData, which throws on a tainted canvas — silently dropping
            // the frame (logo shows on the projector but not on NDI). Tauri's
            // asset protocol serves the CORS headers this needs.
            img.crossOrigin = "anonymous"
            img.onload = () => {
              // Ignore a stale load if the path changed again meanwhile.
              if (logoPathRef.current !== path) return
              logoImgRef.current = img
              drawRef.current()
              pushNdiBurst()
            }
            img.src = safeFileSrc(path)
          }
        }
        logDebug("Received broadcast:output-visibility", event.payload)
        drawRef.current()
        pushNdiBurst()
      }
    )

    // Central base/master theme — the backdrop for Clear and transparent content.
    // Preload its images so renderVerse can paint the background immediately.
    const unlistenBaseTheme = listenOutputEvent(
      BROADCAST_EVENTS.baseTheme,
      (event) => {
        baseThemeRef.current = event.payload.theme
        preloadThemeImages(event.payload.theme)
        // A video or procedural animated base background needs a per-frame
        // redraw (draw-only — it never pushed NDI on its own); static backgrounds
        // (solid/gradient/image/theme) don't.
        renderLoop.deactivate("baseVideo")
        const baseBgType = event.payload.theme.background.type
        if (baseBgType === "video" || baseBgType === "animated") {
          renderLoop.activate("baseVideo", { push: false })
        }
        logDebug("Received broadcast:base-theme", {
          themeId: event.payload.theme.id,
        })
        drawRef.current()
        pushNdiBurst()
      }
    )

    const unlistenNdiConfig = listenOutputEvent(
      BROADCAST_EVENTS.ndiConfig,
      (event) => {
        ndiConfigRef.current = event.payload
        logDebug("Received broadcast:ndi-config", event.payload)
        // Toggling NDI changes which surface wins (NDI resolution vs monitor),
        // so re-render to pick up the new surface + object-fit.
        drawRef.current()
        // Push burst when NDI becomes active
        if (event.payload.active) pushNdiBurst()
      }
    )

    // How this output sizes its surface (native / custom / fit). Applied via the
    // draw loop (surface + object-fit are computed there), so we just stash it
    // and redraw. Defaults to native until the first message arrives.
    const unlistenDisplayConfig = listenOutputEvent(
      BROADCAST_EVENTS.displayConfig,
      (event) => {
        displayConfigRef.current = event.payload
        logDebug("Received broadcast:display-config", event.payload)
        drawRef.current()
      }
    )

    // Request current NDI status on mount (fixes race condition
    // where NDI is started before this window opens)
    void getNdiStatus(OUTPUT_ID)
      .then((status) => {
        if (status && status.active) {
          ndiConfigRef.current = {
            active: true,
            fps: status.fps,
            width: status.width,
            height: status.height,
            alphaMode: status.alphaMode,
          }
          logDebug("Fetched NDI status on mount", status)
        }
      })
      .catch(() => {
        // Command may not exist yet
      })

    sendOutputReady()
    logDebug("Sent broadcast:output-ready")

    // When an already-mounted window is shown again (e.g. hidden NDI window
    // reused as preview), the useEffect above won't re-run, so the main window
    // can ask us to re-announce readiness via this event.
    const unlistenResync = listenOutputEvent(
      BROADCAST_EVENTS.requestResync,
      () => {
        logDebug("Received resync request, re-emitting output-ready")
        sendOutputReady()
      }
    )

    // Track the window's real inner size so native mode renders at the true
    // output resolution and reflows when the window is resized or moved to a
    // different monitor.
    const applyWindowSize = (size: { width: number; height: number }) => {
      windowSizeRef.current = { width: size.width, height: size.height }
      drawRef.current()
    }
    void currentWindow
      .innerSize()
      .then(applyWindowSize)
      .catch(() => {})
    const unlistenResized = currentWindow.onResized((event) => {
      applyWindowSize(event.payload)
    })

    return () => {
      unlistenResync.then((fn) => fn())
      unlistenResized.then((fn) => fn())
      unlisten.then((fn) => fn())
      unlistenSlide.then((fn) => fn())
      unlistenMedia.then((fn) => fn())
      unlistenMediaFit.then((fn) => fn())
      unlistenTransport.then((fn) => fn())
      unlistenAlert.then((fn) => fn())
      unlistenAlertDismiss.then((fn) => fn())
      unlistenAlertDismissAll.then((fn) => fn())
      unlistenCountdown.then((fn) => fn())
      unlistenCountdownUpdate.then((fn) => fn())
      unlistenCountdownSync.then((fn) => fn())
      unlistenCountdownDismiss.then((fn) => fn())
      unlistenCountdownDismissAll.then((fn) => fn())
      unlistenProps.then((fn) => fn())
      unlistenMediaLayer.then((fn) => fn())
      unlistenMute.then((fn) => fn())
      unlistenVisibility.then((fn) => fn())
      unlistenBaseTheme.then((fn) => fn())
      // Tears down every coalesced animation reason (slide/media-layer video,
      // slide-anim, marquee, countdown, theme-anim, base-video) in one call.
      renderLoop.stop()
      renderLoopRef.current = null
      unlistenStage.then((fn) => fn())
      unlistenNdiConfig.then((fn) => fn())
      unlistenDisplayConfig.then((fn) => fn())
      // Cleanup must cancel/tear down the ref's latest value at unmount, not a
      // snapshot copied at effect setup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      cancelAnimationFrame(stageClockRafRef.current)
      cancelAnimationFrame(videoRafRef.current)
      if (transitionRef.current)
        cancelAnimationFrame(transitionRef.current.rafId)
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const [, v] of videoCacheRef.current) {
        v.pause()
        v.src = ""
      }
      if (videoRef.current) {
        videoRef.current.pause()
        videoRef.current.src = ""
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ""
      }
      if (mediaLayerVideoRef.current) {
        mediaLayerVideoRef.current.pause()
        mediaLayerVideoRef.current.src = ""
      }
    }
  }, [
    draw,
    logDebug,
    computeSurface,
    preloadThemeImages,
    pushNdiFrame,
    pushNdiBurst,
    startSlideVideoLoop,
    startMediaLayerVideoLoop,
    startTransition,
    snapshotCurrentCanvas,
    snapshotElementsOnly,
  ])

  // Stage mode: tick every second to update the clock
  useEffect(() => {
    if (OUTPUT_MODE !== "stage") return
    const timer = setInterval(() => {
      if (stageDataRef.current) {
        draw()
        void pushNdiFrame()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [draw, pushNdiFrame])

  // Slow keepalive: push one frame every 2s if idle (prevents NDI receivers from dropping the source)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!ndiConfigRef.current.active) return
      const elapsed = Date.now() - lastPushRef.current
      if (elapsed > 2000) void pushNdiFrame()
    }, 2000)
    return () => clearInterval(timer)
  }, [pushNdiFrame])

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          width: "100vw",
          height: "100vh",
          display: "block",
          objectFit: "contain",
        }}
      />
      <OutputWebLayer />
    </>
  )
}

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)
