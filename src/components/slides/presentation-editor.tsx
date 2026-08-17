import { useRef, useEffect, useCallback, useState, useMemo, memo } from "react"
import {
  PlusIcon,
  TrashIcon,
  SaveIcon,
  XIcon,
  TypeIcon,
  LayersIcon,
  CopyIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ImageIcon,
  BookOpenIcon,
  ArrowUpToLineIcon,
  ArrowDownToLineIcon,
  GripVerticalIcon,
  SquareIcon,
  VideoIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
  GridIcon,
  Undo2Icon,
  Redo2Icon,
  DownloadIcon,
  UploadIcon,
  FileTextIcon,
  PlayCircleIcon,
  MinusIcon,
  MaximizeIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { usePresentationStore } from "@/stores/presentation-store"
import { SlideElementProperties } from "@/components/slides/slide-element-properties"
import { SlideImageProperties } from "@/components/slides/slide-image-properties"
import { SlideScriptureProperties } from "@/components/slides/slide-scripture-properties"
import { SlideShapeProperties } from "@/components/slides/slide-shape-properties"
import { SlideVideoProperties } from "@/components/slides/slide-video-properties"
import { SlideBackgroundProperties } from "@/components/slides/slide-background-properties"
import { SlideCanvasOverlay } from "@/components/slides/slide-canvas-overlay"
import { SlideThemePicker } from "@/components/slides/slide-theme-picker"
import { SlideFormatToolbar } from "@/components/slides/slide-format-toolbar"
import {
  renderSlide,
  drawSlideElements,
  slideHasVideo,
  slideHasVideoBackground,
  slideHasAnimatedBackground,
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
import {
  exportAllSlidesAsPdf,
  exportCurrentSlideAsPdf,
} from "@/lib/slide-pdf-export"
import {
  captureLayerRowRects,
  pickLayerIndexAtY,
  type LayerRowRect,
} from "@/lib/slides/layer-drag"
import { acquireOffscreenCanvas } from "@/lib/dom/offscreen-canvas"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type {
  SlideElement,
  SlideTextElement,
  SlideTransitionType,
} from "@/types/slide"

function elementIcon(el: SlideElement) {
  const elType = el.type ?? "text"
  switch (elType) {
    case "image":
      return <ImageIcon className="size-3 shrink-0" />
    case "scripture":
      return <BookOpenIcon className="size-3 shrink-0" />
    case "shape":
      return <SquareIcon className="size-3 shrink-0" />
    case "video":
      return <VideoIcon className="size-3 shrink-0" />
    default:
      return <TypeIcon className="size-3 shrink-0" />
  }
}

function elementLabel(el: SlideElement): string {
  const elType = el.type ?? "text"
  switch (elType) {
    case "image":
      return "Image"
    case "scripture":
      return el.type === "scripture" ? el.reference || "Scripture" : "Scripture"
    case "shape":
      return el.type === "shape"
        ? el.shapeType === "circle"
          ? "Circle"
          : el.shapeType === "rounded-rect"
            ? "Rounded Rect"
            : "Rectangle"
        : "Shape"
    case "video":
      return "Video"
    default:
      return el.type === "text"
        ? el.text.slice(0, 30) || "Empty text"
        : "Element"
  }
}

function LayerList({
  elements,
  selectedElementId,
}: {
  elements: SlideElement[]
  selectedElementId: string | null
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Row rects are snapshotted once at drag-start (the list doesn't reflow mid-
  // drag) and the hover update is rAF-coalesced to one write per frame — no
  // per-pointermove layout read (P2).
  const rowRectsRef = useRef<LayerRowRect[]>([])
  const moveRafRef = useRef(0)
  const pendingYRef = useRef(0)

  const reversed = useMemo(() => [...elements].reverse(), [elements])

  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    if (listRef.current) {
      rowRectsRef.current = captureLayerRowRects(listRef.current)
    }
    setDragIdx(idx)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return
    pendingYRef.current = e.clientY
    if (moveRafRef.current) return
    moveRafRef.current = requestAnimationFrame(() => {
      moveRafRef.current = 0
      const idx = pickLayerIndexAtY(rowRectsRef.current, pendingYRef.current)
      if (idx !== null) setOverIdx(idx)
    })
  }

  const endDrag = () => {
    if (moveRafRef.current) {
      cancelAnimationFrame(moveRafRef.current)
      moveRafRef.current = 0
    }
  }

  const handlePointerUp = () => {
    endDrag()
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      const fromOriginal = elements.length - 1 - dragIdx
      const toOriginal = elements.length - 1 - overIdx
      usePresentationStore.getState().reorderElement(fromOriginal, toOriginal)
    }
    setDragIdx(null)
    setOverIdx(null)
  }

  useEffect(() => endDrag, [])

  return (
    <div className="border-b border-border">
      <ScrollArea className="max-h-36">
        <div
          ref={listRef}
          className="flex flex-col gap-0.5 p-1.5"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {reversed.map((el, idx) => (
            <div
              key={el.id}
              data-layer-idx={idx}
              className={cn(
                "group flex items-center gap-1 rounded-md px-1 py-1.5 text-left text-xs transition-colors",
                selectedElementId === el.id
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                dragIdx === idx && "opacity-40",
                overIdx === idx &&
                  dragIdx !== null &&
                  dragIdx !== idx &&
                  "border-t-2 border-primary"
              )}
              onClick={() =>
                usePresentationStore.getState().setSelectedElement(el.id)
              }
            >
              <span
                className="flex cursor-grab touch-none items-center"
                onPointerDown={(e) => handlePointerDown(e, idx)}
              >
                <GripVerticalIcon className="size-3 shrink-0 text-muted-foreground/50" />
              </span>
              {elementIcon(el)}
              <span
                className={cn(
                  "truncate",
                  el.visible === false && "line-through opacity-50"
                )}
              >
                {elementLabel(el)}
              </span>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    usePresentationStore.getState().updateDraftElement(el.id, {
                      visible: el.visible === false ? undefined : false,
                    })
                  }}
                  title={el.visible === false ? "Show" : "Hide"}
                >
                  {el.visible === false ? (
                    <EyeOffIcon className="size-2.5" />
                  ) : (
                    <EyeIcon className="size-2.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    usePresentationStore
                      .getState()
                      .updateDraftElement(el.id, { locked: !el.locked })
                  }}
                  title={el.locked ? "Unlock" : "Lock"}
                >
                  {el.locked ? (
                    <LockIcon className="size-2.5" />
                  ) : (
                    <UnlockIcon className="size-2.5" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete element"
                  className="size-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    usePresentationStore.getState().removeElement(el.id)
                  }}
                >
                  <TrashIcon className="size-2.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function SlideStrip({
  onPreviewTransition,
}: {
  onPreviewTransition?: (slideIndex: number) => void
}) {
  const draft = usePresentationStore((s) => s.draftPresentation)
  const activeIndex = usePresentationStore((s) => s.activeSlideIndex)

  if (!draft) return null

  return (
    <div className="flex h-full w-[15%] shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium text-foreground">Slides</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => usePresentationStore.getState().addSlide()}
            title="Add slide"
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-1.5 p-2">
          {draft.slides.map((slide, index) => (
            <SlideThumb
              key={slide.id}
              slide={slide}
              index={index}
              active={activeIndex === index}
              total={draft.slides.length}
              onPreviewTransition={onPreviewTransition}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

const TRANSITION_LABELS: Record<SlideTransitionType | "cut", string> = {
  cut: "Cut",
  fade: "Fade",
  dissolve: "Dissolve",
  "push-left": "Push L",
  "push-right": "Push R",
  "wipe-left": "Wipe L",
  "wipe-right": "Wipe R",
}

const SlideThumb = memo(function SlideThumb({
  slide,
  index,
  active,
  total,
  onPreviewTransition,
}: {
  slide: import("@/types/slide").Slide
  index: number
  active: boolean
  total: number
  onPreviewTransition?: (slideIndex: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const paint = () => {
      canvas.width = 192
      canvas.height = 108
      renderSlide(ctx, slide, 192, 108, getSlideImageCache())
    }
    paint()
    if (slide.background.type === "image") {
      ensureSlideImages(slide.background.imageUrl, paint)
    }
    for (const el of slide.elements) {
      if (el.type === "image" && el.imageUrl) {
        ensureSlideImages(el.imageUrl, paint)
      }
    }
  }, [slide])

  const currentTransition = slide.transition?.type ?? "cut"

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-md border transition-all",
        active
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/30"
      )}
    >
      <button
        type="button"
        className="w-full"
        onClick={() =>
          usePresentationStore.getState().setActiveSlideIndex(index)
        }
      >
        <div className="relative aspect-video w-full overflow-hidden rounded-t-md bg-muted">
          <canvas ref={canvasRef} className="size-full object-contain" />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[0.5625rem] text-white">
            {index + 1}
          </span>
        </div>
      </button>

      {/* Transition selector */}
      {index > 0 && (
        <div className="flex items-center gap-1 border-t border-border px-1 py-0.5">
          <select
            className="h-5 w-full rounded bg-card text-[0.5625rem] text-muted-foreground hover:text-foreground [&>option]:bg-card [&>option]:text-foreground"
            value={currentTransition}
            onChange={(e) => {
              const type = e.target.value as SlideTransitionType
              const store = usePresentationStore.getState()
              store.updateDraftSlide({
                ...slide,
                transition:
                  type === "cut"
                    ? undefined
                    : { type, duration: slide.transition?.duration ?? 500 },
              })
            }}
            title="Slide transition"
          >
            {Object.entries(TRANSITION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          {currentTransition !== "cut" && (
            <>
              <input
                type="number"
                className="h-5 w-12 rounded border border-border bg-transparent px-1 text-[0.5625rem] text-muted-foreground"
                value={slide.transition?.duration ?? 500}
                min={100}
                max={3000}
                step={100}
                title="Duration (ms)"
                onChange={(e) => {
                  const store = usePresentationStore.getState()
                  store.updateDraftSlide({
                    ...slide,
                    transition: {
                      type: currentTransition as SlideTransitionType,
                      duration: Number(e.target.value),
                    },
                  })
                }}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5 shrink-0"
                title="Preview transition"
                onClick={() => onPreviewTransition?.(index)}
              >
                <PlayCircleIcon className="size-3" />
              </Button>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-0.5 p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          title="Duplicate slide"
          onClick={() => usePresentationStore.getState().duplicateSlide(index)}
        >
          <CopyIcon className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          title="Move up"
          disabled={index === 0}
          onClick={() =>
            usePresentationStore.getState().reorderSlide(index, index - 1)
          }
        >
          <ChevronUpIcon className="size-2.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-5"
          title="Move down"
          disabled={index === total - 1}
          onClick={() =>
            usePresentationStore.getState().reorderSlide(index, index + 1)
          }
        >
          <ChevronDownIcon className="size-2.5" />
        </Button>
        {total > 1 && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5 text-destructive hover:text-destructive"
            title="Delete slide"
            onClick={() => usePresentationStore.getState().removeSlide(index)}
          >
            <TrashIcon className="size-2.5" />
          </Button>
        )}
      </div>
    </div>
  )
})

function ElementPropertiesRouter({ element }: { element: SlideElement }) {
  const elType = element.type ?? "text"
  switch (elType) {
    case "image":
      return (
        <SlideImageProperties
          element={element as import("@/types/slide").SlideImageElement}
        />
      )
    case "scripture":
      return (
        <SlideScriptureProperties
          element={element as import("@/types/slide").SlideScriptureElement}
        />
      )
    case "shape":
      return (
        <SlideShapeProperties
          element={element as import("@/types/slide").SlideShapeElement}
        />
      )
    case "video":
      return (
        <SlideVideoProperties
          element={element as import("@/types/slide").SlideVideoElement}
        />
      )
    default:
      return (
        <SlideElementProperties
          element={element as import("@/types/slide").SlideTextElement}
        />
      )
  }
}

export function PresentationEditor({
  onClose,
  embedded = false,
  themeMode = false,
}: {
  onClose: () => void
  /** Fill the parent instead of a full-screen `fixed inset-0` overlay. */
  embedded?: boolean
  /**
   * Author a single-slide song *theme* rather than a deck: hide the multi-slide
   * strip and deck-only chrome (export/import/apply-theme), and save to the
   * custom-theme collection (theme-unification-plan.md, Phase 4 editor shell).
   */
  themeMode?: boolean
}) {
  const draft = usePresentationStore((s) => s.draftPresentation)
  const activeSlideIndex = usePresentationStore((s) => s.activeSlideIndex)
  const selectedElementId = usePresentationStore((s) => s.selectedElementId)
  const editingTextElementId = usePresentationStore(
    (s) => s.editingTextElementId
  )
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
  const [showGrid, setShowGrid] = useState(false)
  const [rightTab, setRightTab] = useState<"layers" | "background">("layers")

  const [zoomLevel, setZoomLevel] = useState(100)
  const transitionPreviewRef = useRef<{
    prevCanvas: HTMLCanvasElement
    type: SlideTransitionType
    duration: number
    rafId: number
  } | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return
      const store = usePresentationStore.getState()

      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        store.selectedElementId
      ) {
        e.preventDefault()
        store.removeElement(store.selectedElementId)
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        store.undo()
      }
      if (
        (e.key === "y" && (e.ctrlKey || e.metaKey)) ||
        (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault()
        store.redo()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const activeSlide = draft?.slides[activeSlideIndex] ?? null

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeSlide) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    canvas.width = 1920
    canvas.height = 1080
    const renderOpts: SlideRenderOptions = { frameTime: performance.now() }
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
      1920,
      1080,
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
      1920,
      1080,
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
            ? getTextLineCount(mCtx, el as SlideTextElement, 1920, 1080)
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
    const prevCanvas = acquireOffscreenCanvas(prevFrameCanvasRef, 1920, 1080)
    const prevCtx = prevCanvas.getContext("2d")
    if (!prevCtx) return
    if (persistBg) {
      drawSlideElements(prevCtx, prevSlide, 1920, 1080, {
        imageCache: getSlideImageCache(),
      })
    } else {
      renderSlide(prevCtx, prevSlide, 1920, 1080, getSlideImageCache())
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
      canvas.width = 1920
      canvas.height = 1080
      renderSlide(
        ctx,
        slide,
        1920,
        1080,
        getSlideImageCache(),
        videoCacheRef.current,
        { frameTime: performance.now() }
      )

      // Overlay the previous slide with transition effect
      switch (type) {
        case "fade":
        case "dissolve":
          ctx.save()
          ctx.globalAlpha = 1 - progress
          ctx.drawImage(prevCanvas, 0, 0, 1920, 1080)
          ctx.restore()
          break
        case "push-left":
          ctx.drawImage(prevCanvas, -(1920 * progress), 0, 1920, 1080)
          break
        case "push-right":
          ctx.drawImage(prevCanvas, 1920 * progress, 0, 1920, 1080)
          break
        case "wipe-left": {
          const wipeX = 1920 * (1 - progress)
          ctx.save()
          ctx.beginPath()
          ctx.rect(wipeX, 0, 1920 - wipeX, 1080)
          ctx.clip()
          ctx.drawImage(prevCanvas, 0, 0, 1920, 1080)
          ctx.restore()
          break
        }
        case "wipe-right": {
          const wipeW = 1920 * (1 - progress)
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, wipeW, 1080)
          ctx.clip()
          ctx.drawImage(prevCanvas, 0, 0, 1920, 1080)
          ctx.restore()
          break
        }
      }

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
    } else if (activeSlide && slideHasAnimatedBackground(activeSlide)) {
      // No video, but a time-driven animated background needs a persistent loop.
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

  if (!draft) return null

  const selectedElement =
    activeSlide?.elements.find((e) => e.id === selectedElementId) ?? null

  return (
    <div
      className={cn(
        "flex bg-background",
        embedded ? "h-full min-h-0 w-full" : "fixed inset-0 z-50"
      )}
    >
      {/* Left: Slide strip — a theme is a single slide, so hide it in theme mode */}
      {!themeMode && (
        <SlideStrip onPreviewTransition={handlePreviewTransition} />
      )}

      {/* Center: Canvas preview */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center justify-between border-b border-border px-4">
          <Input
            value={draft.name}
            onChange={(e) => {
              const store = usePresentationStore.getState()
              if (store.draftPresentation) {
                usePresentationStore.setState({
                  draftPresentation: {
                    ...store.draftPresentation,
                    name: e.target.value,
                  },
                })
              }
            }}
            className="h-7 w-64 text-sm font-medium"
            placeholder={themeMode ? "Theme name" : "Presentation name"}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              title="Undo (Ctrl+Z)"
              onClick={() => usePresentationStore.getState().undo()}
            >
              <Undo2Icon className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="Redo (Ctrl+Y)"
              onClick={() => usePresentationStore.getState().redo()}
            >
              <Redo2Icon className="size-3.5" />
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant={showGrid ? "default" : "ghost"}
              size="icon-sm"
              title="Toggle grid"
              onClick={() => setShowGrid((v) => !v)}
            >
              <GridIcon className="size-3.5" />
            </Button>
            {!themeMode && (
              <>
                <SlideThemePicker />
                <div className="mx-1 h-5 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Export presentation"
                  onClick={() => {
                    if (!draft) return
                    const json = usePresentationStore
                      .getState()
                      .exportPresentation(draft.id)
                    if (!json) return
                    const blob = new Blob([json], { type: "application/json" })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement("a")
                    a.href = url
                    a.download = `${draft.name || "presentation"}.json`
                    a.click()
                    URL.revokeObjectURL(url)
                    toast.success("Presentation exported as JSON")
                  }}
                >
                  <DownloadIcon className="size-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Export as PDF"
                    >
                      <FileTextIcon className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={async () => {
                        if (!draft) return
                        await exportCurrentSlideAsPdf(draft, activeSlideIndex)
                        toast.success("Slide exported as PDF")
                      }}
                    >
                      Export current slide
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () => {
                        if (!draft) return
                        await exportAllSlidesAsPdf(draft)
                        toast.success("All slides exported as PDF")
                      }}
                    >
                      Export all slides
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Import presentation"
                  onClick={() => {
                    const input = document.createElement("input")
                    input.type = "file"
                    input.accept = ".json"
                    input.onchange = () => {
                      const file = input.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        const json = reader.result as string
                        usePresentationStore.getState().importPresentation(json)
                      }
                      reader.readAsText(file)
                    }
                    input.click()
                  }}
                >
                  <UploadIcon className="size-3.5" />
                </Button>
              </>
            )}
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                usePresentationStore.getState().discardDraft()
                onClose()
              }}
            >
              <XIcon className="mr-1.5 size-3" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                usePresentationStore.getState().saveDraft()
                toast.success(themeMode ? "Theme saved" : "Presentation saved")
              }}
            >
              <SaveIcon className="mr-1.5 size-3" />
              Save
            </Button>
          </div>
        </div>

        {/* Format toolbar */}
        <SlideFormatToolbar element={selectedElement} />

        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-muted/30 p-8">
          <div
            className="relative aspect-video shrink-0"
            style={{
              maxHeight: zoomLevel === 100 ? "100%" : "none",
              maxWidth: zoomLevel === 100 ? "100%" : "none",
              width:
                zoomLevel !== 100 ? `${(zoomLevel / 100) * 80}%` : undefined,
            }}
          >
            <canvas
              ref={canvasRef}
              className="block size-full rounded border border-border shadow-lg"
            />
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0 rounded"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)",
                  backgroundSize: "10% 10%",
                }}
              />
            )}
            <SlideCanvasOverlay canvasRef={canvasRef} />
          </div>

          {/* Zoom controls */}
          <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-md border border-border bg-card/90 px-1 py-0.5 shadow-sm backdrop-blur-sm">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              title="Zoom out"
              onClick={() =>
                setZoomLevel((z) => Math.max(25, Math.round(z * 0.9)))
              }
            >
              <MinusIcon className="size-3" />
            </Button>
            <span className="min-w-[2.5rem] text-center text-[0.6875rem] text-muted-foreground tabular-nums">
              {zoomLevel}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              title="Zoom in"
              onClick={() =>
                setZoomLevel((z) => Math.min(300, Math.round(z * 1.1)))
              }
            >
              <PlusIcon className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-6"
              title="Fit to view"
              onClick={() => setZoomLevel(100)}
            >
              <MaximizeIcon className="size-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Tabbed panel */}
      <div className="flex w-[20%] min-w-0 shrink-0 flex-col border-l border-border bg-card">
        <div className="flex h-11 border-b border-border">
          <button
            type="button"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
              rightTab === "layers"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setRightTab("layers")}
          >
            <LayersIcon className="size-3.5" />
            Layers
          </button>
          <button
            type="button"
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
              rightTab === "background"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setRightTab("background")}
          >
            <ImageIcon className="size-3.5" />
            Background
          </button>
        </div>

        {rightTab === "background" ? (
          <div className="min-h-0 flex-1 overflow-auto">
            <SlideBackgroundProperties />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
              <div className="flex items-center gap-0.5">
                {selectedElementId && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Bring to front"
                      onClick={() =>
                        usePresentationStore
                          .getState()
                          .moveElementToTop(selectedElementId)
                      }
                    >
                      <ArrowUpToLineIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Move up"
                      onClick={() =>
                        usePresentationStore
                          .getState()
                          .moveElementUp(selectedElementId)
                      }
                    >
                      <ChevronUpIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Move down"
                      onClick={() =>
                        usePresentationStore
                          .getState()
                          .moveElementDown(selectedElementId)
                      }
                    >
                      <ChevronDownIcon className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Send to back"
                      onClick={() =>
                        usePresentationStore
                          .getState()
                          .moveElementToBottom(selectedElementId)
                      }
                    >
                      <ArrowDownToLineIcon className="size-3" />
                    </Button>
                    <div className="mx-0.5 h-4 w-px bg-border" />
                  </>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" title="Add element">
                    <PlusIcon className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => usePresentationStore.getState().addElement()}
                  >
                    <TypeIcon className="mr-2 size-3.5" />
                    Text
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      usePresentationStore.getState().addImageElement()
                    }
                  >
                    <ImageIcon className="mr-2 size-3.5" />
                    Image
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      usePresentationStore.getState().addScriptureElement()
                    }
                  >
                    <BookOpenIcon className="mr-2 size-3.5" />
                    Scripture
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      usePresentationStore.getState().addShapeElement()
                    }
                  >
                    <SquareIcon className="mr-2 size-3.5" />
                    Shape
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      usePresentationStore.getState().addVideoElement()
                    }
                  >
                    <VideoIcon className="mr-2 size-3.5" />
                    Video
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <LayerList
              elements={activeSlide?.elements ?? []}
              selectedElementId={selectedElementId}
            />

            <div className="min-h-0 flex-1 overflow-hidden">
              {selectedElement ? (
                <ElementPropertiesRouter element={selectedElement} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-xs text-muted-foreground">
                    Select an element
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
