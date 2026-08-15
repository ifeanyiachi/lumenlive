import { createRoot } from "react-dom/client"
import { useRef, useEffect, useCallback } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { OutputWebLayer } from "@/components/broadcast/output-web-layer"
import { renderVerse } from "@/lib/verse-renderer"
import {
  renderSlide,
  drawSlideElements,
  slideHasVideoBackground,
  slideHasScrollingText,
  slideHasAnimatedBackground,
  sameAnimatedBackground,
  getTextLineCount,
  getTextWordCount,
} from "@/lib/slide-renderer"
import { drawStageDisplay } from "@/lib/stage-display-renderer"
import {
  drawMediaFitted,
  DEFAULT_MEDIA_FIT,
  type MediaFitConfig,
  type ContainBackground,
} from "@/lib/media-fit"
import {
  drawAlertOverlay as paintAlertOverlay,
  drawCountdownOverlay as paintCountdownOverlay,
  drawPropsOverlay as paintPropsOverlay,
  drawTransitionFrame as paintTransitionFrame,
} from "@/lib/broadcast-output/overlays"
import {
  toFitConfig,
  shouldPushNdiFrame,
  type MediaFitPayload,
} from "@/lib/broadcast-output/frame"
import {
  resolveSurface,
  resolvePreviewObjectFit,
  type Surface,
  type ResolvedSurface,
} from "@/lib/broadcast-output/surface"
import { shouldSendTransparentNdi } from "@/lib/broadcast-output/ndi-key"
import { sendNdiFrame, getNdiStatus } from "@/services/ndi-output-gateway"
import type { StageDisplayData } from "@/lib/stage-display-renderer"
import type { SlideRenderOptions } from "@/lib/slide-renderer"
import {
  createSlideAnimationTracker,
  updateAnimationTracker,
  isAnimationActive,
} from "@/lib/slide-animation"
import type { SlideAnimationTracker } from "@/lib/slide-animation"
import type {
  BroadcastTheme,
  VerseRenderData,
  LayerFilter,
  OutputDisplayMode,
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
import type { BroadcastProp, MediaLayerState } from "@/stores/broadcast-store"
import type { NdiConfigEventPayload } from "@/types"

/** Read output config from URL hash fragment (#output=main&mode=normal). Defaults to "main"/"normal". */
const _hashParams = new URLSearchParams(window.location.hash.slice(1))
const OUTPUT_ID = _hashParams.get("output") ?? "main"
const OUTPUT_MODE = _hashParams.get("mode") ?? "normal"

interface BroadcastPayload {
  theme: BroadcastTheme
  verse: VerseRenderData | null
  layerFilter?: LayerFilter
}

interface SlidePayload {
  slide: Slide
  prevSlide?: Slide
  layerFilter?: LayerFilter
}

interface MediaPayload {
  filePath: string
  mediaType: "image" | "video" | "audio"
  name: string
  trimStart?: number
  trimEnd?: number
  loop?: boolean
  endAction?: "hold" | "stop" | "loop" | "next"
  fit?: MediaFitConfig["fit"]
  zoom?: number
  focalX?: number
  focalY?: number
  containBackground?: ContainBackground
  containBackgroundColor?: string
  layerFilter?: LayerFilter
}

interface MediaTransportPayload {
  action: "play" | "pause" | "seek"
  position?: number
}

interface AlertPayload {
  alert: ActiveAlert
  template: AlertTemplate
}

interface AlertDismissPayload {
  alertId: string
}

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
  // Redraw loop for a video base background (the theme render path has none of
  // its own). Runs only while the base background is a video.
  const baseVideoRafRef = useRef(0)
  // Redraw loop for the live verse theme's own procedural animated background.
  // Runs only while the current (verse-mode) theme background is `animated`.
  const themeAnimRafRef = useRef(0)
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
  const marqueeRafRef = useRef<number>(0)
  const countdownRafRef = useRef<number>(0)
  const activeMode = useRef<"verse" | "slide" | "media">("verse")
  const slideAnimTracker = useRef<SlideAnimationTracker | null>(null)
  const slideAnimRafRef = useRef<number>(0)
  const mediaLayerRef = useRef<MediaLayerState | null>(null)
  const mediaLayerImgRef = useRef<HTMLImageElement | null>(null)
  const mediaLayerVideoRef = useRef<HTMLVideoElement | null>(null)
  const mediaLayerRafRef = useRef<number>(0)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const prevCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const transitionRef = useRef<{
    type: SlideTransitionType
    duration: number
    startTime: number
    rafId: number
  } | null>(null)
  const slideVideoRafRef = useRef<number>(0)
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

  const drawAlertOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      paintAlertOverlay(ctx, w, h, activeAlerts.current)
    },
    []
  )

  const drawCountdownOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      paintCountdownOverlay(ctx, w, h, activeCountdowns.current, Date.now())
    },
    []
  )

  const drawPropsOverlay = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      paintPropsOverlay(
        ctx,
        w,
        h,
        activeProps.current,
        imageCacheRef.current,
        Date.now()
      )
    },
    []
  )

  const drawMediaSource = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      source: HTMLImageElement | HTMLVideoElement,
      w: number,
      h: number,
      fit: MediaFitConfig = DEFAULT_MEDIA_FIT
    ) => {
      drawMediaFitted(ctx, source, w, h, fit)
    },
    []
  )

  const drawMediaLayer = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      if (!mediaLayerRef.current) return
      if (
        mediaLayerRef.current.mediaType === "image" &&
        mediaLayerImgRef.current
      ) {
        drawMediaSource(ctx, mediaLayerImgRef.current, w, h)
      } else if (
        mediaLayerRef.current.mediaType === "video" &&
        mediaLayerVideoRef.current &&
        mediaLayerVideoRef.current.readyState >= 2
      ) {
        drawMediaSource(ctx, mediaLayerVideoRef.current, w, h)
      }
    },
    [drawMediaSource]
  )

  // Draw the central base theme's backdrop (background + decorative elements,
  // no verse text) onto the surface. Used for Clear and behind transparent
  // content. No-op until a base theme is delivered.
  const drawBaseTheme = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const bt = baseThemeRef.current
      if (!bt) return
      renderVerse(ctx, bt, null, {
        scale: 1,
        imageCache: imageCacheRef.current,
        surface: { width: w, height: h },
        frameTime: performance.now(),
      })
    },
    []
  )

  const snapshotCurrentCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!prevCanvasRef.current) {
      prevCanvasRef.current = document.createElement("canvas")
    }
    const prev = prevCanvasRef.current
    prev.width = canvas.width
    prev.height = canvas.height
    const pCtx = prev.getContext("2d")
    if (pCtx) pCtx.drawImage(canvas, 0, 0)
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
      const prev = prevCanvasRef.current
      // Snapshot at the live surface size so the transition blends against a
      // same-sized current frame (no scale/ghost on non-16:9 surfaces).
      const { width: sw, height: sh } = computeSurface()
      prev.width = sw
      prev.height = sh
      const pCtx = prev.getContext("2d")
      if (!pCtx) return
      pCtx.clearRect(0, 0, prev.width, prev.height)
      drawSlideElements(pCtx, slide, prev.width, prev.height, {
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Resolve the render surface for this output (native monitor / custom / NDI).
    // NDI wins while active so the feed is never distorted (surface.ts §7).
    const surface = computeSurface()
    const previewFit = resolvePreviewObjectFit(
      surface.source,
      displayConfigRef.current.customFit
    )
    const sw = surface.width
    const sh = surface.height

    if (OUTPUT_MODE === "stage" && stageDataRef.current) {
      // Stage reflows to the surface (drawStageDisplay applies a uniform scale +
      // zone re-anchor). Native fills the monitor; NDI/custom follow the surface.
      canvas.style.objectFit = previewFit
      canvas.width = sw
      canvas.height = sh
      drawStageDisplay(
        ctx,
        sw,
        sh,
        stageDataRef.current,
        imageCacheRef.current,
        videoCacheRef.current
      )
      return
    }

    const activeFilter = layerFilterRef.current
    const hasMediaLayer =
      mediaLayerRef.current !== null &&
      (!activeFilter || activeFilter.showMediaLayer)

    if (clearForegroundRef.current) {
      // Clear reveals the central base theme (its background + branding) with no
      // content text — consistent across verse / slide / song. The media layer
      // sits beneath it.
      canvas.style.objectFit = previewFit
      canvas.width = sw
      canvas.height = sh
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, sw, sh)
      if (hasMediaLayer) drawMediaLayer(ctx, sw, sh)
      drawBaseTheme(ctx, sw, sh)
    } else if (activeMode.current === "media") {
      // Media fills the full surface (image/video fit is applied within the frame).
      canvas.style.objectFit = previewFit
      canvas.width = sw
      canvas.height = sh
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, sw, sh)
      if (hasMediaLayer) drawMediaLayer(ctx, sw, sh)
      if ((!activeFilter || activeFilter.showContent) && latestMedia.current) {
        drawMediaSource(
          ctx,
          latestMedia.current.img,
          sw,
          sh,
          mediaFitRef.current
        )
      } else if (
        !mediaBlankRef.current &&
        videoRef.current &&
        videoRef.current.readyState >= 2
      ) {
        drawMediaSource(ctx, videoRef.current, sw, sh, mediaFitRef.current)
      }
    } else if (activeMode.current === "slide" && latestSlide.current) {
      // Slides are percentage-based, so they reflow to the surface natively.
      const { slide } = latestSlide.current
      canvas.style.objectFit = previewFit
      canvas.width = sw
      canvas.height = sh
      const renderOpts: SlideRenderOptions = { frameTime: performance.now() }
      const tracker = slideAnimTracker.current
      if (tracker && isAnimationActive(tracker)) {
        renderOpts.animationStates = tracker.elementStates
        renderOpts.textBuildProgress = tracker.textBuildProgress
      }
      if (slide.background.type === "transparent") {
        // Transparent slide/song composits over the central base theme (media
        // layer beneath it). We draw the slide's ELEMENTS directly rather than
        // via renderSlide, because renderSlide's transparent background does a
        // clearRect() that would wipe the base theme we just painted.
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, sw, sh)
        if (hasMediaLayer) drawMediaLayer(ctx, sw, sh)
        drawBaseTheme(ctx, sw, sh)
        drawSlideElements(
          ctx,
          slide,
          sw,
          sh,
          {
            imageCache: imageCacheRef.current,
            videoCache: videoCacheRef.current,
          },
          renderOpts
        )
      } else {
        renderSlide(
          ctx,
          slide,
          sw,
          sh,
          imageCacheRef.current,
          videoCacheRef.current,
          renderOpts
        )
      }
    } else {
      // Verse reflows to the surface; the verse renderer projects the theme onto
      // it and (when enabled) auto-fits the font to fill the box height.
      canvas.style.objectFit = previewFit
      const data = latestData.current
      if (!data) {
        canvas.width = sw
        canvas.height = sh
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        if (hasMediaLayer) drawMediaLayer(ctx, canvas.width, canvas.height)
      } else {
        const { theme, verse } = data
        canvas.width = sw
        canvas.height = sh
        if (theme.background.type === "transparent") {
          ctx.fillStyle = "#000"
          ctx.fillRect(0, 0, sw, sh)
          if (hasMediaLayer) drawMediaLayer(ctx, sw, sh)
          // Only draw the base theme when it differs from the verse's own theme,
          // otherwise renderVerse below would draw that theme (and its elements)
          // a second time.
          if (baseThemeRef.current && baseThemeRef.current.id !== theme.id) {
            drawBaseTheme(ctx, sw, sh)
          }
        }
        const result = renderVerse(ctx, theme, verse, {
          // Decorative elements are re-anchored to the surface inside the verse
          // renderer (per-element anchors), so no uniform element scale here.
          scale: 1,
          imageCache: imageCacheRef.current,
          surface: { width: sw, height: sh },
          verseAutoFit: displayConfigRef.current.verseAutoFit,
          maxVerseScale: displayConfigRef.current.maxVerseScale,
          minVerseFontSize: displayConfigRef.current.minVerseFontSize,
          frameTime: performance.now(),
        })
        if (!result) {
          ctx.fillStyle = "#000"
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          if (hasMediaLayer) drawMediaLayer(ctx, canvas.width, canvas.height)
          logDebug("renderVerse returned null; drew fallback frame")
        }
      }
    }

    const lf = layerFilterRef.current
    if (!lf || lf.showProps) drawPropsOverlay(ctx, canvas.width, canvas.height)
    if (!lf || lf.showAlerts) drawAlertOverlay(ctx, canvas.width, canvas.height)
    if (!lf || lf.showCountdowns)
      drawCountdownOverlay(ctx, canvas.width, canvas.height)

    // "Logo": a holding image over content + overlays, on black. Shown as a black
    // holding screen until the image finishes loading. Black (below) still wins.
    if (showLogoRef.current) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (logoImgRef.current) {
        drawMediaSource(ctx, logoImgRef.current, canvas.width, canvas.height, {
          ...DEFAULT_MEDIA_FIT,
          fit: "contain",
        })
      }
    }

    // "Black": a full cut to black over content AND overlays — the final word.
    // pushNdiFrame reads this same canvas, so the NDI feed blacks out too.
    if (blackoutRef.current) {
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [
    logDebug,
    computeSurface,
    drawAlertOverlay,
    drawCountdownOverlay,
    drawPropsOverlay,
    drawMediaSource,
    drawMediaLayer,
    drawBaseTheme,
  ])

  const preloadThemeImages = useCallback(
    (theme: BroadcastTheme) => {
      const bg = theme.background
      const cache = imageCacheRef.current
      if (bg.type === "image" && bg.image?.url) {
        const url = bg.image.url
        if (!cache.has(url)) {
          const img = new Image()
          // CORS-clean so the canvas stays readable for the NDI getImageData
          // capture (a tainted canvas still displays but can't be read back).
          img.crossOrigin = "anonymous"
          img.onload = () => {
            cache.set(url, img)
            logDebug("Background image loaded", { url })
            draw()
          }
          img.onerror = () => {
            console.warn("[broadcast-output] failed to load background image", {
              url,
            })
          }
          img.src = url
        }
      }
      if (bg.type === "video" && bg.video?.url) {
        const url = bg.video.url
        const cacheKey = `video:${url}`
        if (!cache.has(cacheKey)) {
          const video = document.createElement("video")
          // CORS-clean so the drawn video frames keep the canvas readable for
          // the NDI getImageData capture.
          video.crossOrigin = "anonymous"
          video.src = url
          video.muted = true
          video.loop = true
          video.playsInline = true
          video.addEventListener(
            "canplay",
            () => {
              cache.set(cacheKey, video as unknown as HTMLImageElement)
              void video.play().catch(() => {})
              logDebug("Background video loaded", { url })
              draw()
            },
            { once: true }
          )
          video.load()
        }
      }
      for (const el of theme.elements ?? []) {
        if (el.type === "image" && el.image?.url && !cache.has(el.image.url)) {
          const url = el.image.url
          const img = new Image()
          img.crossOrigin = "anonymous"
          img.onload = () => {
            cache.set(url, img)
            logDebug("Theme element image loaded", { url })
            draw()
          }
          img.onerror = () => {
            console.warn("[broadcast-output] failed to load element image", {
              url,
            })
          }
          img.src = url
        }
      }
    },
    [draw, logDebug]
  )

  // Render ONLY the foreground graphics (verse text / slide elements + overlays)
  // onto a transparent canvas, for a see-through (keyable) NDI feed. Deliberately
  // omits the black floor, the central base theme, and the media layer that the
  // opaque program draws — those are the backdrop a downstream switcher supplies.
  // Only ever called when `shouldSendTransparentNdi` says the content qualifies.
  const drawNdiForeground = useCallback(
    (ctx: CanvasRenderingContext2D, sw: number, sh: number) => {
      ctx.clearRect(0, 0, sw, sh)
      const activeFilter = layerFilterRef.current
      if (activeMode.current === "slide" && latestSlide.current) {
        const { slide } = latestSlide.current
        const renderOpts: SlideRenderOptions = { frameTime: performance.now() }
        const tracker = slideAnimTracker.current
        if (tracker && isAnimationActive(tracker)) {
          renderOpts.animationStates = tracker.elementStates
          renderOpts.textBuildProgress = tracker.textBuildProgress
        }
        drawSlideElements(
          ctx,
          slide,
          sw,
          sh,
          {
            imageCache: imageCacheRef.current,
            videoCache: videoCacheRef.current,
          },
          renderOpts
        )
      } else if (activeMode.current === "verse" && latestData.current) {
        const { theme, verse } = latestData.current
        renderVerse(ctx, theme, verse, {
          scale: 1,
          imageCache: imageCacheRef.current,
          surface: { width: sw, height: sh },
          verseAutoFit: displayConfigRef.current.verseAutoFit,
          maxVerseScale: displayConfigRef.current.maxVerseScale,
          minVerseFontSize: displayConfigRef.current.minVerseFontSize,
          frameTime: performance.now(),
        })
      }
      // Foreground overlays belong in the keyed feed too.
      if (!activeFilter || activeFilter.showProps) drawPropsOverlay(ctx, sw, sh)
      if (!activeFilter || activeFilter.showAlerts)
        drawAlertOverlay(ctx, sw, sh)
      if (!activeFilter || activeFilter.showCountdowns)
        drawCountdownOverlay(ctx, sw, sh)
    },
    [drawPropsOverlay, drawAlertOverlay, drawCountdownOverlay]
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

        if (keyed) {
          const ndiCanvas =
            ndiCanvasRef.current ?? document.createElement("canvas")
          ndiCanvas.width = targetWidth
          ndiCanvas.height = targetHeight
          const ndiCtx = ndiCanvas.getContext("2d", {
            willReadFrequently: true,
          })
          if (!ndiCtx) return
          drawNdiForeground(ndiCtx, targetWidth, targetHeight)
          ndiCanvasRef.current = ndiCanvas
          const imageData = ndiCtx.getImageData(0, 0, targetWidth, targetHeight)
          await sendNdiFrame(
            OUTPUT_ID,
            imageData.data.buffer,
            targetWidth,
            targetHeight
          )
          lastPushRef.current = Date.now()
          return
        }

        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        let sourceCtx = ctx
        let sourceWidth = canvas.width
        let sourceHeight = canvas.height

        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          const ndiCanvas =
            ndiCanvasRef.current ?? document.createElement("canvas")
          ndiCanvas.width = targetWidth
          ndiCanvas.height = targetHeight
          // willReadFrequently: this canvas exists only to be read back via
          // getImageData, so keep it CPU-backed and skip the GPU->CPU roundtrip.
          const ndiCtx = ndiCanvas.getContext("2d", {
            willReadFrequently: true,
          })
          if (!ndiCtx) return
          ndiCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
          ndiCanvasRef.current = ndiCanvas
          sourceCtx = ndiCtx
          sourceWidth = targetWidth
          sourceHeight = targetHeight
        }

        // Read raw RGBA pixels and hand the underlying ArrayBuffer straight to
        // Tauri's binary IPC. No base64 (33% inflation + string churn) and no
        // JSON serialization of a multi-megabyte payload — the bytes cross the
        // bridge as a raw request body, with metadata in headers.
        const imageData = sourceCtx.getImageData(
          0,
          0,
          sourceWidth,
          sourceHeight
        )

        await sendNdiFrame(
          OUTPUT_ID,
          imageData.data.buffer,
          sourceWidth,
          sourceHeight
        )
        lastPushRef.current = Date.now()
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
    cancelAnimationFrame(slideVideoRafRef.current)
    const tick = () => {
      if (activeMode.current !== "slide") return
      draw()
      void pushNdiFrame()
      slideVideoRafRef.current = requestAnimationFrame(tick)
    }
    slideVideoRafRef.current = requestAnimationFrame(tick)
  }, [draw, pushNdiFrame])

  const startMediaLayerVideoLoop = useCallback(() => {
    cancelAnimationFrame(mediaLayerRafRef.current)
    const tick = () => {
      draw()
      void pushNdiFrame()
      mediaLayerRafRef.current = requestAnimationFrame(tick)
    }
    mediaLayerRafRef.current = requestAnimationFrame(tick)
  }, [draw, pushNdiFrame])

  // Keep drawRef current without writing during render; it's read only from
  // requestAnimationFrame ticks (after commit).
  useEffect(() => {
    drawRef.current = draw
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
      void currentWindow
        .emitTo("main", "broadcast:media-progress", {
          position: el.currentTime,
          duration: Number.isFinite(el.duration) ? el.duration : 0,
          playing: !el.paused && !el.ended,
          ended: el.ended,
        })
        .catch(() => {})
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
        void currentWindow
          .emitTo("main", "broadcast:media-ended", {})
          .catch(() => {})
      }
    }

    const unlisten = currentWindow.listen<BroadcastPayload>(
      "broadcast:verse-update",
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
        cancelAnimationFrame(slideVideoRafRef.current)
        for (const [, v] of videoCacheRef.current) {
          v.pause()
        }
        preloadThemeImages(event.payload.theme)
        logDebug("Received broadcast:verse-update", {
          hasVerse: Boolean(event.payload.verse),
          themeId: event.payload.theme.id,
        })
        // A procedural animated background is clock-driven, so it needs a
        // per-frame redraw; static backgrounds don't. Start/stop accordingly.
        cancelAnimationFrame(themeAnimRafRef.current)
        if (event.payload.theme.background.type === "animated") {
          const tick = () => {
            drawRef.current()
            themeAnimRafRef.current = requestAnimationFrame(tick)
          }
          themeAnimRafRef.current = requestAnimationFrame(tick)
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

    const unlistenSlide = currentWindow.listen<SlidePayload>(
      "broadcast:slide-update",
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
        cancelAnimationFrame(themeAnimRafRef.current)
        if (videoRef.current) {
          videoRef.current.pause()
          videoRef.current.src = ""
        }
        if (audioRef.current) {
          audioRef.current.pause()
          audioRef.current.src = ""
        }
        cancelAnimationFrame(videoRafRef.current)
        cancelAnimationFrame(slideVideoRafRef.current)
        logDebug("Received broadcast:slide-update", {
          slideName: event.payload.slide.name,
        })

        const slide = event.payload.slide
        for (const el of slide.elements) {
          if (
            el.type === "image" &&
            el.imageUrl &&
            !imageCacheRef.current.has(el.imageUrl)
          ) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              imageCacheRef.current.set(el.imageUrl, img)
              draw()
              pushNdiBurst()
            }
            img.src = el.imageUrl
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
        cancelAnimationFrame(slideAnimRafRef.current)
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

          const animTick = () => {
            updateAnimationTracker(tracker, animInfo, performance.now())
            draw()
            void pushNdiFrame()
            if (!tracker.isComplete || hasScrolling || hasAnimatedBg) {
              slideAnimRafRef.current = requestAnimationFrame(animTick)
            }
          }
          slideAnimRafRef.current = requestAnimationFrame(animTick)
        } else {
          slideAnimTracker.current = null
        }
      }
    )

    const unlistenMedia = currentWindow.listen<MediaPayload>(
      "broadcast:media-update",
      (event) => {
        const { filePath, mediaType, name } = event.payload
        const src = convertFileSrc(filePath)
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
        cancelAnimationFrame(slideVideoRafRef.current)
        for (const [, v] of videoCacheRef.current) {
          v.pause()
        }
        activeMode.current = "media"
        // Leaving verse mode: stop the verse theme's animated-background loop.
        cancelAnimationFrame(themeAnimRafRef.current)

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
              void currentWindow
                .emitTo("main", "broadcast:media-ended", {})
                .catch(() => {})
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

    const unlistenMediaFit = currentWindow.listen<MediaFitPayload>(
      "broadcast:media-fit-update",
      (event) => {
        if (activeMode.current !== "media") return
        mediaFitRef.current = toFitConfig(event.payload)
        draw()
        pushNdiBurst()
      }
    )

    const unlistenTransport = currentWindow.listen<MediaTransportPayload>(
      "broadcast:media-transport",
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

    const unlistenAlert = currentWindow.listen<AlertPayload>(
      "broadcast:alert",
      (event) => {
        activeAlerts.current = [...activeAlerts.current, event.payload]
        logDebug("Received broadcast:alert", {
          message: event.payload.alert.message,
        })
        draw()
        pushNdiBurst()
      }
    )

    const unlistenAlertDismiss = currentWindow.listen<AlertDismissPayload>(
      "broadcast:alert-dismiss",
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

    const unlistenAlertDismissAll = currentWindow.listen(
      "broadcast:alert-dismiss-all",
      () => {
        activeAlerts.current = []
        logDebug("Received broadcast:alert-dismiss-all")
        draw()
        pushNdiBurst()
      }
    )

    // A countdown re-renders every frame (the time text changes), so one
    // self-sustaining RAF runs while any countdown is active — the same shape
    // as the marquee ticker. Cancel-first so start/update/sync never stack loops.
    const ensureCountdownLoop = () => {
      cancelAnimationFrame(countdownRafRef.current)
      countdownRafRef.current = 0
      const tickCountdown = () => {
        if (activeCountdowns.current.length === 0) {
          countdownRafRef.current = 0
          return
        }
        draw()
        void pushNdiFrame()
        countdownRafRef.current = requestAnimationFrame(tickCountdown)
      }
      if (activeCountdowns.current.length > 0) {
        countdownRafRef.current = requestAnimationFrame(tickCountdown)
      }
    }

    const unlistenCountdown = currentWindow.listen<{
      countdown: ActiveCountdown
      timer: CountdownTimer
      theme?: BroadcastTheme
    }>("broadcast:countdown", (event) => {
      activeCountdowns.current = [...activeCountdowns.current, event.payload]
      logDebug("Received broadcast:countdown", {
        label: event.payload.timer.label,
      })
      ensureCountdownLoop()
    })

    // Pause/resume/±time all arrive as a full-state replace for one countdown.
    const unlistenCountdownUpdate = currentWindow.listen<{
      countdown: ActiveCountdown
      timer: CountdownTimer
      theme?: BroadcastTheme
    }>("broadcast:countdown-update", (event) => {
      activeCountdowns.current = activeCountdowns.current.map((c) =>
        c.countdown.id === event.payload.countdown.id ? event.payload : c
      )
      logDebug("Received broadcast:countdown-update", {
        label: event.payload.timer.label,
        state: event.payload.countdown.state,
      })
      ensureCountdownLoop()
    })

    // Full replace of the active set — sent when this window (re)announces
    // readiness so a countdown that started before it opened still appears.
    // Replace (not append) keeps already-synced windows from doubling entries.
    const unlistenCountdownSync = currentWindow.listen<{
      items: {
        countdown: ActiveCountdown
        timer: CountdownTimer
        theme?: BroadcastTheme
      }[]
    }>("broadcast:countdown-sync", (event) => {
      activeCountdowns.current = event.payload.items
      logDebug("Received broadcast:countdown-sync", {
        count: event.payload.items.length,
      })
      ensureCountdownLoop()
    })

    const unlistenCountdownDismiss = currentWindow.listen<{
      countdownId: string
    }>("broadcast:countdown-dismiss", (event) => {
      activeCountdowns.current = activeCountdowns.current.filter(
        (c) => c.countdown.id !== event.payload.countdownId
      )
      logDebug("Received broadcast:countdown-dismiss", {
        countdownId: event.payload.countdownId,
      })
      draw()
      pushNdiBurst()
    })

    const unlistenCountdownDismissAll = currentWindow.listen(
      "broadcast:countdown-dismiss-all",
      () => {
        activeCountdowns.current = []
        logDebug("Received broadcast:countdown-dismiss-all")
        draw()
        pushNdiBurst()
      }
    )

    const unlistenProps = currentWindow.listen<{ props: BroadcastProp[] }>(
      "broadcast:props-update",
      (event) => {
        activeProps.current = event.payload.props
        logDebug("Received broadcast:props-update", {
          count: event.payload.props.length,
        })
        for (const prop of event.payload.props) {
          if (
            prop.type === "image" &&
            prop.imageUrl &&
            !imageCacheRef.current.has(prop.imageUrl)
          ) {
            const img = new Image()
            img.crossOrigin = "anonymous"
            img.onload = () => {
              imageCacheRef.current.set(prop.imageUrl!, img)
              draw()
              pushNdiBurst()
            }
            img.src = prop.imageUrl
          }
        }
        draw()
        pushNdiBurst()

        // A marquee scrolls every frame, so keep a self-sustaining RAF running
        // while any active prop is a marquee (mirrors the countdown ticker).
        // Cancel first so repeated updates never stack multiple loops.
        cancelAnimationFrame(marqueeRafRef.current)
        marqueeRafRef.current = 0
        const tickMarquee = () => {
          if (!activeProps.current.some((p) => p.type === "marquee")) {
            marqueeRafRef.current = 0
            return
          }
          draw()
          void pushNdiFrame()
          marqueeRafRef.current = requestAnimationFrame(tickMarquee)
        }
        if (activeProps.current.some((p) => p.type === "marquee")) {
          marqueeRafRef.current = requestAnimationFrame(tickMarquee)
        }
      }
    )

    const unlistenMediaLayer = currentWindow.listen<{
      layer: MediaLayerState | null
    }>("broadcast:media-layer-update", (event) => {
      const { layer } = event.payload
      logDebug("Received broadcast:media-layer-update", {
        layer: layer?.name ?? null,
      })

      cancelAnimationFrame(mediaLayerRafRef.current)
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

      const src = convertFileSrc(layer.filePath)

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
    })

    const unlistenStage = currentWindow.listen<StageDisplayData>(
      "broadcast:stage-update",
      (event) => {
        stageDataRef.current = event.payload
        logDebug("Received broadcast:stage-update")
        if (OUTPUT_MODE === "stage") {
          draw()
          pushNdiBurst()
        }
      }
    )

    const unlistenMute = currentWindow.listen<{ muted: boolean }>(
      "broadcast:mute",
      (event) => {
        broadcastMutedRef.current = event.payload.muted
        if (videoRef.current) {
          videoRef.current.muted = event.payload.muted
        }
        if (audioRef.current) {
          audioRef.current.muted = event.payload.muted
        }
        logDebug("Received broadcast:mute", { muted: event.payload.muted })
      }
    )

    // Live-output visibility (Black / Clear / Logo). Stash into refs and repaint;
    // push a short NDI burst so the feed reflects the change even when idle. The
    // logo image is loaded lazily and only when its path changes.
    const unlistenVisibility = currentWindow.listen<{
      blackout: boolean
      clear: boolean
      logo: boolean
      logoImagePath: string | null
    }>("broadcast:output-visibility", (event) => {
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
          img.src = convertFileSrc(path)
        }
      }
      logDebug("Received broadcast:output-visibility", event.payload)
      drawRef.current()
      pushNdiBurst()
    })

    // Central base/master theme — the backdrop for Clear and transparent content.
    // Preload its images so renderVerse can paint the background immediately.
    const unlistenBaseTheme = currentWindow.listen<{ theme: BroadcastTheme }>(
      "broadcast:base-theme",
      (event) => {
        baseThemeRef.current = event.payload.theme
        preloadThemeImages(event.payload.theme)
        // A video or procedural animated base background needs a per-frame
        // redraw; static backgrounds (solid/gradient/image/theme) don't.
        cancelAnimationFrame(baseVideoRafRef.current)
        const baseBgType = event.payload.theme.background.type
        if (baseBgType === "video" || baseBgType === "animated") {
          const tick = () => {
            drawRef.current()
            baseVideoRafRef.current = requestAnimationFrame(tick)
          }
          baseVideoRafRef.current = requestAnimationFrame(tick)
        }
        logDebug("Received broadcast:base-theme", {
          themeId: event.payload.theme.id,
        })
        drawRef.current()
        pushNdiBurst()
      }
    )

    const unlistenNdiConfig = currentWindow.listen<NdiConfigEventPayload>(
      "broadcast:ndi-config",
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
    const unlistenDisplayConfig = currentWindow.listen<{
      displayMode: OutputDisplayMode
      customResolution: Surface | null
      customFit: "contain" | "cover"
      verseAutoFit: boolean
      maxVerseScale: number
      minVerseFontSize: number
    }>("broadcast:display-config", (event) => {
      displayConfigRef.current = event.payload
      logDebug("Received broadcast:display-config", event.payload)
      drawRef.current()
    })

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

    void currentWindow
      .emitTo("main", "broadcast:output-ready")
      .then(() => {
        logDebug("Sent broadcast:output-ready")
      })
      .catch(() => {
        console.warn("[broadcast-output] failed to send output-ready event")
      })

    // When an already-mounted window is shown again (e.g. hidden NDI window
    // reused as preview), the useEffect above won't re-run, so the main window
    // can ask us to re-announce readiness via this event.
    const unlistenResync = currentWindow.listen(
      "broadcast:request-resync",
      () => {
        logDebug("Received resync request, re-emitting output-ready")
        void currentWindow
          .emitTo("main", "broadcast:output-ready")
          .catch(() => {})
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
      cancelAnimationFrame(baseVideoRafRef.current)
      cancelAnimationFrame(themeAnimRafRef.current)
      unlistenStage.then((fn) => fn())
      unlistenNdiConfig.then((fn) => fn())
      unlistenDisplayConfig.then((fn) => fn())
      // Cleanup must cancel/tear down the ref's latest value at unmount, not a
      // snapshot copied at effect setup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      cancelAnimationFrame(stageClockRafRef.current)
      cancelAnimationFrame(videoRafRef.current)
      cancelAnimationFrame(slideVideoRafRef.current)
      cancelAnimationFrame(mediaLayerRafRef.current)
      cancelAnimationFrame(slideAnimRafRef.current)
      cancelAnimationFrame(marqueeRafRef.current)
      cancelAnimationFrame(countdownRafRef.current)
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
