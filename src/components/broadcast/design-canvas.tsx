import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import * as fabric from "fabric"
import { useBroadcastStore } from "@/stores"
import { renderVerse } from "@/lib/verse-renderer"
import type { VerseLayoutMetrics } from "@/lib/verse-renderer"
import { renderCountdownTheme } from "@/lib/countdown/theme-render"
import { ThemeCanvasOverlay } from "./theme-canvas-overlay"
import { Button } from "@/components/ui/button"
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  MousePointer2Icon,
  Grid3X3Icon,
  MaximizeIcon,
} from "lucide-react"
import type { BroadcastTheme, VerseRenderData } from "@/types"

const WS_WIDTH = 1920
const WS_HEIGHT = 1080
const DESIGNER_SAMPLE_VERSE: VerseRenderData = {
  reference: "Genesis 1:1 (KJV)",
  segments: [
    {
      verseNumber: 1,
      text: "In the beginning God created the heaven and the earth.",
    },
  ],
}
/** Sample frame the designer paints for a `countdown`-category theme. */
const DESIGNER_SAMPLE_COUNTDOWN = {
  timeText: "04:59",
  label: "STARTING SOON",
  showLabel: true,
} as const

interface WsScreenRect {
  left: number
  top: number
  width: number
  height: number
}

export function DesignCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const workspaceRef = useRef<fabric.Rect | null>(null)
  const latestThemeRef = useRef<BroadcastTheme | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map())
  const imageRequestsRef = useRef<Map<string, Promise<HTMLImageElement>>>(
    new Map()
  )
  const videoCacheRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  const videoRafRef = useRef<number | null>(null)
  const metricsRef = useRef<VerseLayoutMetrics | null>(null)
  // Persistent scratch canvas + pattern reused across frames so a video-background
  // theme doesn't allocate an ~8MB canvas and a new fabric.Pattern every rAF tick.
  const bitmapCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const patternRef = useRef<fabric.Pattern | null>(null)
  const [metrics, setMetrics] = useState<VerseLayoutMetrics | null>(null)

  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const editingThemeId = useBroadcastStore((s) => s.editingThemeId)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const transitionPreviewTrigger = useBroadcastStore(
    (s) => s.transitionPreviewTrigger
  )
  const [zoomLevel, setZoomLevel] = useState(0)
  const [wsScreenRect, setWsScreenRect] = useState<WsScreenRect | null>(null)
  const [previewPhase, setPreviewPhase] = useState<"idle" | "out" | "in">(
    "idle"
  )

  const computeWsScreenRect = useCallback((): WsScreenRect | null => {
    const canvas = fabricRef.current
    const ws = workspaceRef.current
    if (!canvas || !ws) return null
    const vpt = canvas.viewportTransform!
    const zoom = vpt[0]
    // Fabric.js v7 defaults to originX/Y="center", so ws.left/top is the
    // center of the rect, not the top-left corner.
    const wsLeft = (ws.left ?? 0) - WS_WIDTH / 2
    const wsTop = (ws.top ?? 0) - WS_HEIGHT / 2
    return {
      left: wsLeft * zoom + vpt[4],
      top: wsTop * zoom + vpt[5],
      width: WS_WIDTH * zoom,
      height: WS_HEIGHT * zoom,
    }
  }, [])

  const resyncLatestTheme = useCallback(() => {
    const latestTheme = latestThemeRef.current
    const canvas = fabricRef.current
    const ws = workspaceRef.current
    if (!latestTheme || !canvas || !ws) return
    syncThemeToCanvas(
      latestTheme,
      ws,
      canvas,
      imageCacheRef.current,
      imageRequestsRef.current,
      videoCacheRef.current,
      metricsRef,
      bitmapCanvasRef,
      patternRef,
      setMetrics
    )
  }, [])

  const autoZoom = useCallback(() => {
    const canvas = fabricRef.current
    const container = containerRef.current
    const workspace = workspaceRef.current
    if (!canvas || !container || !workspace) return

    const cw = container.offsetWidth
    const ch = container.offsetHeight
    canvas.setDimensions({ width: cw, height: ch })

    const identity: fabric.TMat2D = [1, 0, 0, 1, 0, 0]
    canvas.setViewportTransform(identity)

    const scale =
      fabric.util.findScaleToFit(workspace, { width: cw, height: ch }) * 0.85
    canvas.setZoom(scale)

    const wsCenter = workspace.getCenterPoint()
    const vpTransform = canvas.viewportTransform!
    vpTransform[4] = cw / 2 - wsCenter.x * vpTransform[0]
    vpTransform[5] = ch / 2 - wsCenter.y * vpTransform[3]
    canvas.setViewportTransform(vpTransform)
    canvas.requestRenderAll()
    resyncLatestTheme()

    setZoomLevel(Math.round(scale * 100))
    setWsScreenRect(computeWsScreenRect())
  }, [resyncLatestTheme, computeWsScreenRect])

  // Initialize Fabric canvas + workspace
  useEffect(() => {
    if (!canvasElRef.current || !containerRef.current || !editingThemeId) return

    const canvas = new fabric.Canvas(canvasElRef.current, {
      backgroundColor: "#18181b",
      selection: false,
    })

    const cw = containerRef.current.offsetWidth
    const ch = containerRef.current.offsetHeight
    canvas.setDimensions({ width: cw, height: ch })

    const workspace = new fabric.Rect({
      width: WS_WIDTH,
      height: WS_HEIGHT,
      fill: "white",
      selectable: false,
      hasControls: false,
      hoverCursor: "default",
      evented: false,
      shadow: new fabric.Shadow({ color: "rgba(0,0,0,0.4)", blur: 20 }),
    })
    canvas.add(workspace)
    canvas.centerObject(workspace)
    workspace.setCoords()
    canvas.clipPath = workspace
    workspaceRef.current = workspace

    fabricRef.current = canvas

    requestAnimationFrame(() => {
      autoZoom()
    })

    const observer = new ResizeObserver(() => autoZoom())
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      rafIdRef.current = null
      if (videoRafRef.current) cancelAnimationFrame(videoRafRef.current)
      videoRafRef.current = null
      // Cleanup must tear down the ref's latest cache at unmount, not a snapshot
      // copied at effect setup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      for (const vid of videoCacheRef.current.values()) {
        vid.pause()
        vid.src = ""
      }
      videoCacheRef.current.clear()
      void canvas.dispose()
      fabricRef.current = null
      workspaceRef.current = null
      metricsRef.current = null
    }
  }, [editingThemeId, autoZoom])

  // Sync draft theme to canvas (throttled to 1 per frame)
  useEffect(() => {
    const canvas = fabricRef.current
    const ws = workspaceRef.current
    if (!canvas || !ws || !draftTheme) return
    latestThemeRef.current = draftTheme

    if (rafIdRef.current) return
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      const latest = latestThemeRef.current
      const latestCanvas = fabricRef.current
      const latestWs = workspaceRef.current
      if (!latest || !latestCanvas || !latestWs) return
      syncThemeToCanvas(
        latest,
        latestWs,
        latestCanvas,
        imageCacheRef.current,
        imageRequestsRef.current,
        videoCacheRef.current,
        metricsRef,
        bitmapCanvasRef,
        patternRef,
        setMetrics,
        () => {
          const current = latestThemeRef.current
          const currentCanvas = fabricRef.current
          const currentWs = workspaceRef.current
          if (!current || !currentCanvas || !currentWs) return
          syncThemeToCanvas(
            current,
            currentWs,
            currentCanvas,
            imageCacheRef.current,
            imageRequestsRef.current,
            videoCacheRef.current,
            metricsRef,
            bitmapCanvasRef,
            patternRef,
            setMetrics
          )
        }
      )
    })
  }, [draftTheme])

  // Continuous rAF loop for backgrounds that redraw every frame (video +
  // procedural animated). Both need the bitmap re-rasterized per tick — the
  // animated engine is clock-driven, the video advances its own texture.
  useEffect(() => {
    const needsLoop =
      (draftTheme?.background.type === "video" &&
        draftTheme.background.video?.url) ||
      (draftTheme?.background.type === "animated" &&
        draftTheme.background.animated)
    if (!needsLoop) {
      if (videoRafRef.current) {
        cancelAnimationFrame(videoRafRef.current)
        videoRafRef.current = null
      }
      return
    }
    const tick = () => {
      resyncLatestTheme()
      videoRafRef.current = requestAnimationFrame(tick)
    }
    videoRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (videoRafRef.current) {
        cancelAnimationFrame(videoRafRef.current)
        videoRafRef.current = null
      }
    }
  }, [
    draftTheme?.background.type,
    draftTheme?.background.video?.url,
    draftTheme?.background.animated,
    resyncLatestTheme,
  ])

  const zoomIn = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const newZoom = Math.min(canvas.getZoom() * 1.1, 3)
    canvas.setZoom(newZoom)
    canvas.requestRenderAll()
    resyncLatestTheme()
    setZoomLevel(Math.round(newZoom * 100))
    setWsScreenRect(computeWsScreenRect())
  }, [resyncLatestTheme, computeWsScreenRect])

  const zoomOut = useCallback(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    const newZoom = Math.max(canvas.getZoom() * 0.9, 0.1)
    canvas.setZoom(newZoom)
    canvas.requestRenderAll()
    resyncLatestTheme()
    setZoomLevel(Math.round(newZoom * 100))
    setWsScreenRect(computeWsScreenRect())
  }, [resyncLatestTheme, computeWsScreenRect])

  useEffect(() => {
    if (!transitionPreviewTrigger || !draftTheme) return
    const t = draftTheme.transition
    if (t.type === "none") return
    const halfDur = t.duration
    // Kicks off a timed transition-preview animation when the trigger changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewPhase("out")
    const t1 = setTimeout(() => setPreviewPhase("in"), halfDur)
    const t2 = setTimeout(() => setPreviewPhase("idle"), halfDur * 2)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
    // Intentionally fires only on transitionPreviewTrigger; draftTheme is read
    // at fire time and must not re-trigger the animation on every theme edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionPreviewTrigger])

  const previewStyle = useMemo((): React.CSSProperties => {
    if (previewPhase === "idle" || !draftTheme) return {}
    const t = draftTheme.transition
    const dur = `${t.duration}ms`
    const ease =
      t.easing === "ease-in"
        ? "ease-in"
        : t.easing === "ease-out"
          ? "ease-out"
          : t.easing === "ease-in-out"
            ? "ease-in-out"
            : "linear"
    const base: React.CSSProperties = { transition: `all ${dur} ${ease}` }
    if (t.type === "fade") {
      return { ...base, opacity: previewPhase === "out" ? 0 : 1 }
    }
    if (t.type === "scale") {
      return {
        ...base,
        transform: previewPhase === "out" ? "scale(0.85)" : "scale(1)",
        opacity: previewPhase === "out" ? 0 : 1,
      }
    }
    if (t.type === "slide") {
      const offsets: Record<string, string> = {
        up: "translateY(-30px)",
        down: "translateY(30px)",
        left: "translateX(-30px)",
        right: "translateX(30px)",
      }
      return {
        ...base,
        transform:
          previewPhase === "out"
            ? (offsets[t.direction] ?? "")
            : "translate(0)",
        opacity: previewPhase === "out" ? 0 : 1,
      }
    }
    return {}
  }, [previewPhase, draftTheme])

  const selectedCustomEl =
    selectedElement &&
    selectedElement !== "verse" &&
    selectedElement !== "reference"
      ? (draftTheme?.elements ?? []).find((e) => e.id === selectedElement)
      : null
  const elementLabel =
    selectedElement === "verse"
      ? "verse"
      : selectedElement === "reference"
        ? "reference"
        : selectedCustomEl
          ? selectedCustomEl.name.toLowerCase()
          : "none"

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div
        className="flex h-14 shrink-0 items-center gap-2 border-b border-border/40 px-3"
        style={{ background: "#18181b" }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Select tool"
          className="text-muted-foreground"
        >
          <MousePointer2Icon className="size-3.5" />
        </Button>
        <div className="flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
          <Grid3X3Icon className="size-3" />
          <span>Grid</span>
        </div>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Search"
          className="text-muted-foreground"
        >
          <SearchIcon className="size-3.5" />
        </Button>
        <span className="min-w-12 text-center text-[0.625rem] font-medium text-muted-foreground tabular-nums">
          {zoomLevel}%
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom out"
          onClick={zoomOut}
          className="text-muted-foreground"
        >
          <MinusIcon className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Zoom in"
          onClick={zoomIn}
          className="text-muted-foreground"
        >
          <PlusIcon className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Fit to screen"
          onClick={autoZoom}
          className="text-muted-foreground"
        >
          <MaximizeIcon className="size-3.5" />
        </Button>
      </div>

      {/* Canvas container */}
      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasElRef} style={previewStyle} />
        <ThemeCanvasOverlay wsRect={wsScreenRect} metrics={metrics} />
        {!draftTheme && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: "#18181b" }}
          >
            <p className="text-xs text-muted-foreground">
              Select a theme to begin editing
            </p>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex h-8 shrink-0 items-center border-t border-border/40 px-3 text-[0.5625rem] text-muted-foreground/70"
        style={{ background: "#18181b" }}
      >
        <span>
          Output: {WS_WIDTH} × {WS_HEIGHT}px
        </span>
        <span className="mx-2">·</span>
        <span>Zoom: {zoomLevel}%</span>
        <span className="mx-2">·</span>
        <span>Drag to reposition, corners to resize</span>
        <span className="mx-2">·</span>
        <span>
          {selectedElement ? (
            <>
              Editing:{" "}
              <span className="font-medium text-primary">{elementLabel}</span>
            </>
          ) : (
            "Click frame to select"
          )}
        </span>
      </div>
    </div>
  )
}

function syncThemeToCanvas(
  theme: BroadcastTheme,
  workspace: fabric.Rect,
  canvas: fabric.Canvas,
  imageCache: Map<string, HTMLImageElement>,
  imageRequests: Map<string, Promise<HTMLImageElement>>,
  videoCache: Map<string, HTMLVideoElement>,
  metricsRef: React.RefObject<VerseLayoutMetrics | null>,
  bitmapCanvasRef: React.RefObject<HTMLCanvasElement | null>,
  patternRef: React.RefObject<fabric.Pattern | null>,
  onMetricsUpdate?: (m: VerseLayoutMetrics | null) => void,
  onImageReady?: () => void
) {
  if (theme.background.type === "image" && theme.background.image?.url) {
    const img = imageCache.get(theme.background.image.url)
    if (!img) {
      ensureImage(
        theme.background.image.url,
        imageCache,
        imageRequests,
        onImageReady
      )
    }
  }

  if (theme.background.type === "video" && theme.background.video?.url) {
    ensureVideo(
      theme.background.video.url,
      videoCache,
      imageCache,
      onImageReady
    )
  }

  for (const el of theme.elements ?? []) {
    if (el.type === "image" && el.image?.url && !imageCache.has(el.image.url)) {
      ensureImage(el.image.url, imageCache, imageRequests, onImageReady)
    }
  }

  const scratch =
    bitmapCanvasRef.current ??
    (bitmapCanvasRef.current = document.createElement("canvas"))
  const { bitmap, metrics: newMetrics } = renderThemeBitmap(
    theme,
    imageCache,
    scratch
  )
  metricsRef.current = newMetrics
  onMetricsUpdate?.(newMetrics)

  // Reuse one Pattern bound to the persistent canvas so a re-render doesn't
  // allocate a fresh ~8MB canvas + Pattern every frame.
  let pattern = patternRef.current
  if (!pattern || pattern.source !== bitmap) {
    pattern = new fabric.Pattern({ source: bitmap, repeat: "no-repeat" })
    patternRef.current = pattern
  }
  workspace.set({ fill: pattern })

  // The scratch canvas is mutated in place, so the Pattern's source reference
  // never changes. Fabric v7 only flags an object dirty when a cached property
  // changes *by reference* (`_set`: `isChanged = this[key] !== value`), so
  // re-setting the identical pattern is a no-op — the rect would keep painting
  // its stale object cache and edits (drag, colour, font…) wouldn't show. Force
  // the flag so Fabric regenerates the cache from the updated pixels.
  workspace.dirty = true

  canvas.requestRenderAll()
}

function ensureImage(
  url: string,
  cache: Map<string, HTMLImageElement>,
  pending: Map<string, Promise<HTMLImageElement>>,
  onReady?: () => void
) {
  if (cache.has(url) || pending.has(url)) return
  const request = loadImage(url)
    .then((img) => {
      cache.set(url, img)
      onReady?.()
      return img
    })
    .catch((error) => {
      console.warn("[theme-designer] failed to load background image", {
        url: url.slice(0, 100),
        error,
      })
      throw error
    })
    .finally(() => {
      pending.delete(url)
    })
  pending.set(url, request)
}

function ensureVideo(
  url: string,
  videoCache: Map<string, HTMLVideoElement>,
  imageCache: Map<string, HTMLImageElement>,
  onReady?: () => void
) {
  const cacheKey = `video:${url}`
  if (videoCache.has(url)) {
    imageCache.set(cacheKey, videoCache.get(url) as unknown as HTMLImageElement)
    return
  }
  const video = document.createElement("video")
  video.src = url
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.crossOrigin = "anonymous"
  video.addEventListener(
    "canplay",
    () => {
      videoCache.set(url, video)
      imageCache.set(cacheKey, video as unknown as HTMLImageElement)
      void video.play().catch(() => {})
      onReady?.()
    },
    { once: true }
  )
  video.load()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    img.src = url
  })
}

function renderThemeBitmap(
  theme: BroadcastTheme,
  imageCache: Map<string, HTMLImageElement>,
  offscreen: HTMLCanvasElement
): { bitmap: HTMLCanvasElement; metrics: VerseLayoutMetrics | null } {
  // Reuse the passed-in scratch canvas. Only (re)size when needed — assigning
  // width/height reallocates the backing store, so guard it and clear instead.
  if (offscreen.width !== WS_WIDTH) offscreen.width = WS_WIDTH
  if (offscreen.height !== WS_HEIGHT) offscreen.height = WS_HEIGHT
  const ctx = offscreen.getContext("2d")
  if (!ctx) return { bitmap: offscreen, metrics: null }
  ctx.clearRect(0, 0, WS_WIDTH, WS_HEIGHT)

  // A countdown theme is styled against a sample ticking timer so the designer
  // is WYSIWYG with the live output — both go through `renderCountdownTheme`.
  const metrics =
    theme.category === "countdown"
      ? renderCountdownTheme(ctx, theme, {
          ...DESIGNER_SAMPLE_COUNTDOWN,
          timeColor: theme.verseText.color,
          imageCache,
        })
      : renderVerse(ctx, theme, DESIGNER_SAMPLE_VERSE, {
          imageCache,
          frameTime: performance.now(),
        })

  return { bitmap: offscreen, metrics }
}
