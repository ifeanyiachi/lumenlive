/**
 * OutputRuntime — the shared spine of the broadcast-output window.
 *
 * `broadcast-output.tsx` (`BroadcastCanvas`) used to declare ~48 `useRef`s and a
 * dozen core callbacks inline, then let a ~900-line effect and every listener
 * mutate those refs and call `draw()` / `pushNdiBurst()` directly. That mutual
 * coupling is why no single listener could be lifted out in isolation.
 *
 * This module packages that spine into ONE plain object — `OutputRuntime` — built
 * once by `useOutputRuntime()`. Every extracted piece (the events registrars, the
 * media-playback hook) receives that single object and reads `rt.latestSlide.current`,
 * `rt.draw()`, etc. It is a plain object, **not** React Context: no re-render
 * machinery, no behavior change — just a documented home for the refs and the core
 * shared actions (`computeSurface`, `readCompositorState`, `draw`, `pushNdiFrame`,
 * `pushNdiBurst`, snapshots, `startTransition`).
 *
 * The refs and callbacks here are moved verbatim from the old component; this is a
 * relocation, not a logic change.
 */

import { useRef, useCallback, useEffect, useMemo } from "react"
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
import { preloadSlideAssets } from "@/lib/broadcast-output/asset-cache"
import { captureAndSendNdiFrame } from "@/lib/broadcast-output/ndi-push"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import { parseBroadcastConfig } from "@/lib/broadcast-output/config"
import { shouldPushNdiFrame } from "@/lib/broadcast-output/frame"
import {
  resolveSurface,
  resolvePreviewObjectFit,
  type Surface,
  type ResolvedSurface,
} from "@/lib/broadcast-output/surface"
import { shouldSendTransparentNdi } from "@/lib/broadcast-output/ndi-key"
import { sendNdiFrame } from "@/services/ndi-output-gateway"
import type { SlideUpdatePayload } from "@/services/broadcast-content-gateway"
import type { StageDisplayData } from "@/lib/stage-display-renderer"
import type { SlideAnimationTracker } from "@/lib/slide-animation"
import type {
  LayerFilter,
  OutputDisplayMode,
  BroadcastProp,
  MediaLayerState,
} from "@/types/broadcast"
import type { Slide, SlideTransitionType } from "@/types/slide"
import type { Theme } from "@/types/theme"
import type {
  AlertTemplate,
  ActiveAlert,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { NdiConfigEventPayload } from "@/types"

// Output config from the URL hash fragment (#output=main&mode=normal). Parsed once
// at module load and shared by the runtime and the window entry component.
export const { outputId: OUTPUT_ID, outputMode: OUTPUT_MODE } =
  parseBroadcastConfig(window.location.hash)

// Cross-window payload shapes now live in the broadcast-content gateway (the
// shared contract, compiler-enforced on both ends). Aliased here for the refs
// that cache the latest received payload; every listener is typed by
// `listenOutputEvent`.
export type SlidePayload = SlideUpdatePayload

/**
 * The runtime object handed to every extracted listener/hook. Built once by
 * `useOutputRuntime()`. Refs are the shared mutable state; the functions are the
 * core shared actions that read/write those refs.
 */
export type OutputRuntime = ReturnType<typeof useOutputRuntime>

export function useOutputRuntime() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
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
  const baseThemeRef = useRef<Theme | null>(null)
  const mediaKindRef = useRef<"image" | "video" | "audio" | null>(null)
  const mediaFitRef = useRef<MediaFitConfig>(DEFAULT_MEDIA_FIT)
  const activeAlerts = useRef<
    { alert: ActiveAlert; template: AlertTemplate }[]
  >([])
  const activeCountdowns = useRef<
    {
      countdown: ActiveCountdown
      timer: CountdownTimer
      theme?: Theme
    }[]
  >([])
  const activeProps = useRef<BroadcastProp[]>([])
  const activeMode = useRef<"slide" | "media">("slide")
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
    }),
    []
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
  // background). The instance is created in the main effect (in the component) and
  // held here so the render-scope loop starters can reach it; reasons are
  // (de)activated by the listeners. The loop draws at most once per frame and
  // pushes NDI iff any active reason wants it.
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


  // The base backdrop is a slide-model Theme (RF3a): preload its slide-shaped assets.
  const preloadBaseThemeImages = useCallback(
    (theme: Theme) => {
      preloadSlideAssets(theme, imageCacheRef.current, draw)
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
                : undefined,
            // The base theme composits behind a transparent slide inside the slide
            // branch itself (paintBaseTheme); there is no separate opaque-base case
            // now that the verse path is retired.
            hasOpaqueBaseTheme: false,
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

  // Assemble the runtime once. Every property below is stable across renders — the
  // refs are `useRef` handles and the actions are `useCallback`s whose deps are
  // themselves stable — so this memo (and therefore the effect that depends on
  // `rt`) never re-runs after mount, preserving the original single-run effect.
  return useMemo(
    () => ({
      outputId: OUTPUT_ID,
      outputMode: OUTPUT_MODE,
      // refs
      canvasRef,
      latestSlide,
      latestMedia,
      layerFilterRef,
      videoRef,
      audioRef,
      videoRafRef,
      mediaConfigRef,
      mediaBlankRef,
      blackoutRef,
      clearForegroundRef,
      showLogoRef,
      logoPathRef,
      logoImgRef,
      baseThemeRef,
      mediaKindRef,
      mediaFitRef,
      activeAlerts,
      activeCountdowns,
      activeProps,
      activeMode,
      slideAnimTracker,
      mediaLayerRef,
      mediaLayerImgRef,
      mediaLayerVideoRef,
      imageCacheRef,
      videoCacheRef,
      prevCanvasRef,
      transitionRef,
      ndiConfigRef,
      ndiCanvasRef,
      windowSizeRef,
      displayConfigRef,
      lastPushRef,
      pushingRef,
      broadcastMutedRef,
      stageDataRef,
      stageClockRafRef,
      drawRef,
      pushNdiFrameRef,
      renderLoopRef,
      // actions
      logDebug,
      computeSurface,
      readCompositorState,
      snapshotCurrentCanvas,
      snapshotElementsOnly,
      drawTransitionFrame,
      draw,
      preloadBaseThemeImages,
      drawNdiForeground,
      pushNdiFrame,
      pushNdiBurst,
      startSlideVideoLoop,
      startMediaLayerVideoLoop,
      startTransition,
    }),
    [
      logDebug,
      computeSurface,
      readCompositorState,
      snapshotCurrentCanvas,
      snapshotElementsOnly,
      drawTransitionFrame,
      draw,
      preloadBaseThemeImages,
      drawNdiForeground,
      pushNdiFrame,
      pushNdiBurst,
      startSlideVideoLoop,
      startMediaLayerVideoLoop,
      startTransition,
    ]
  )
}
