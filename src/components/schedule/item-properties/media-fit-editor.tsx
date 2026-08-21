import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { useScheduleStore } from "@/stores/schedule-store"
import { useBroadcastStore } from "@/stores/broadcast-store"
import {
  drawMediaFitted,
  computeFitPlacement,
  setDefaultMediaFit,
  type MediaFitFields,
} from "@/lib/media-fit"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import type {
  MediaScheduleItem,
  MediaFit,
  ContainBackground,
} from "@/types/schedule"
import type { MediaAsset } from "@/types/media"
import { isScheduleItemLive } from "./shared"

const FIT_OPTIONS: { value: MediaFit; label: string; hint: string }[] = [
  { value: "cover", label: "Cover", hint: "Fill the frame, crop overflow" },
  {
    value: "contain",
    label: "Contain",
    hint: "Fit inside, letterbox with black bars",
  },
  {
    value: "fill",
    label: "Stretch",
    hint: "Stretch to fill, ignores aspect ratio",
  },
  {
    value: "zoom",
    label: "Zoom",
    hint: "Fill the frame, then scale up further",
  },
]

// 3×3 focal grid → focal (x, y) in 0..1.
const FOCAL_POSITIONS: { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 1, y: 0.5 },
  { x: 0, y: 1 },
  { x: 0.5, y: 1 },
  { x: 1, y: 1 },
]

const CONTAIN_BG_OPTIONS: { value: ContainBackground; label: string }[] = [
  { value: "black", label: "Black bars" },
  { value: "blur", label: "Blurred image" },
  { value: "color", label: "Solid color" },
]

/** Extract just the fit-related fields from a media item. */
function fitFieldsOf(item: MediaScheduleItem): MediaFitFields {
  return {
    fit: item.fit,
    zoom: item.zoom,
    focalX: item.focalX,
    focalY: item.focalY,
    containBackground: item.containBackground,
    containBackgroundColor: item.containBackgroundColor,
  }
}

/**
 * Choose how an image/video fills the 16:9 output frame — fit mode, zoom, free
 * pan (drag the preview), and the letterbox background for "contain". Edits the
 * schedule item and, when the item is live, re-applies the change to the output
 * instantly without restarting playback.
 */
export function MediaFitEditor({
  item,
  scheduleId,
  asset,
}: {
  item: MediaScheduleItem
  scheduleId: string
  asset: MediaAsset
}) {
  // Apply a fit change to the schedule item, and re-apply it live if this item
  // is currently on the program output. Reads the freshest item from the store
  // so rapid drag updates merge correctly.
  const applyFit = useCallback(
    (updates: Partial<MediaScheduleItem>) => {
      useScheduleStore.getState().updateItem(scheduleId, item.id, updates)
      if (isScheduleItemLive(item.id)) {
        const latest = useScheduleStore
          .getState()
          .getActiveSchedule()
          ?.items.find((i) => i.id === item.id)
        const merged = {
          ...fitFieldsOf((latest as MediaScheduleItem) ?? item),
          ...updates,
        }
        useBroadcastStore.getState().updateLiveMediaFit({
          fit: merged.fit,
          zoom: merged.zoom,
          focalX: merged.focalX,
          focalY: merged.focalY,
          containBackground: merged.containBackground,
          containBackgroundColor: merged.containBackgroundColor,
        })
      }
    },
    [scheduleId, item]
  )

  const fit = item.fit ?? "cover"
  const zoom = item.zoom ?? 1
  const focalX = item.focalX ?? 0.5
  const focalY = item.focalY ?? 0.5
  const showFocal = fit === "cover" || fit === "zoom"

  const applyToAll = useCallback(() => {
    const schedule = useScheduleStore
      .getState()
      .schedules.find((s) => s.id === scheduleId)
    if (!schedule) return
    const fields = fitFieldsOf(item)
    let count = 0
    for (const it of schedule.items) {
      if (it.type === "media" && it.id !== item.id) {
        useScheduleStore.getState().updateItem(scheduleId, it.id, fields)
        count++
      }
    }
    toast.success(
      count > 0
        ? `Applied fit to ${count} other media item${count > 1 ? "s" : ""}`
        : "No other media items"
    )
  }, [scheduleId, item])

  const saveDefault = useCallback(() => {
    setDefaultMediaFit(fitFieldsOf(item))
    toast.success("Saved as default for new media")
  }, [item])

  return (
    <FieldGroup label="Aspect / Fit">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 p-2">
        <FitPreview
          key={asset.id}
          asset={asset}
          item={item}
          onPan={
            showFocal ? (x, y) => applyFit({ focalX: x, focalY: y }) : undefined
          }
        />

        <select
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
          value={fit}
          onChange={(e) => applyFit({ fit: e.target.value as MediaFit })}
        >
          {FIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-[0.625rem] text-muted-foreground">
          {FIT_OPTIONS.find((o) => o.value === fit)?.hint}
        </p>

        {fit === "zoom" && (
          <div className="flex items-center gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Zoom
            </span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => applyFit({ zoom: Number(e.target.value) })}
              className="h-1 flex-1 cursor-pointer accent-primary"
            />
            <span className="min-w-[2.25rem] shrink-0 text-right text-[0.625rem] text-muted-foreground tabular-nums">
              {zoom.toFixed(2)}×
            </span>
          </div>
        )}

        {fit === "contain" && (
          <div className="flex items-center gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Background
            </span>
            <select
              className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={item.containBackground ?? "black"}
              onChange={(e) =>
                applyFit({
                  containBackground: e.target.value as ContainBackground,
                })
              }
            >
              {CONTAIN_BG_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {(item.containBackground ?? "black") === "color" && (
              <ColorSwatch
                value={item.containBackgroundColor ?? "#000000"}
                onChange={(containBackgroundColor) =>
                  applyFit({ containBackgroundColor })
                }
                className="h-7 w-8 shrink-0 bg-background"
                title="Letterbox color"
              />
            )}
          </div>
        )}

        {showFocal && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Focus
            </span>
            <div className="grid grid-cols-3 gap-0.5">
              {FOCAL_POSITIONS.map((p) => {
                const active =
                  Math.abs(p.x - focalX) < 0.01 && Math.abs(p.y - focalY) < 0.01
                return (
                  <button
                    key={`${p.x}-${p.y}`}
                    type="button"
                    className={cn(
                      "size-4 rounded-sm border transition-colors",
                      active
                        ? "border-primary bg-primary"
                        : "border-border bg-background hover:border-muted-foreground/50"
                    )}
                    title={`Focus ${p.x === 0 ? "left" : p.x === 1 ? "right" : "center"} ${p.y === 0 ? "top" : p.y === 1 ? "bottom" : "middle"}`}
                    onClick={() => applyFit({ focalX: p.x, focalY: p.y })}
                  />
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 flex-1 px-2 text-[0.625rem]"
            onClick={applyToAll}
          >
            Apply to all media
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 flex-1 px-2 text-[0.625rem]"
            onClick={saveDefault}
          >
            Set as default
          </Button>
        </div>
      </div>
    </FieldGroup>
  )
}

/**
 * Live WYSIWYG thumbnail of how the media lands in the 16:9 output for the
 * current fit config. When the fit crops the frame (cover/zoom), the image can
 * be dragged to pan the focal point.
 */
function FitPreview({
  asset,
  item,
  onPan,
}: {
  asset: MediaAsset
  item: MediaScheduleItem
  onPan?: (focalX: number, focalY: number) => void
}) {
  const CW = 320
  const CH = 180
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    startFocalX: number
    startFocalY: number
    overflowX: number
    overflowY: number
  } | null>(null)
  const [ready, setReady] = useState(false)

  const fitCfg = useMemo(
    () => ({
      fit: item.fit,
      zoom: item.zoom,
      focalX: item.focalX,
      focalY: item.focalY,
      background: item.containBackground,
      backgroundColor: item.containBackgroundColor,
    }),
    [
      item.fit,
      item.zoom,
      item.focalX,
      item.focalY,
      item.containBackground,
      item.containBackgroundColor,
    ]
  )

  // Load the source (image, or a representative video frame). The component is
  // keyed on the asset id, so this runs once on mount per asset.
  useEffect(() => {
    let cancelled = false
    const src = (() => {
      try {
        return safeFileSrc(asset.filePath)
      } catch {
        return asset.filePath
      }
    })()
    if (asset.type === "image") {
      const img = new Image()
      img.onload = () => {
        if (!cancelled) {
          sourceRef.current = img
          setReady(true)
        }
      }
      img.onerror = () => {
        /* leave placeholder */
      }
      img.src = src
    } else {
      const video = document.createElement("video")
      video.muted = true
      video.playsInline = true
      video.src = src
      video.onloadeddata = () => {
        try {
          video.currentTime = item.trimStart ?? 0.1
        } catch {
          /* not seekable */
        }
      }
      video.onseeked = () => {
        if (!cancelled) {
          sourceRef.current = video
          setReady(true)
        }
      }
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.filePath, asset.type])

  // Redraw whenever the source is ready or the fit config changes.
  useEffect(() => {
    const canvas = canvasRef.current
    const source = sourceRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.fillStyle = "#000"
    ctx.fillRect(0, 0, CW, CH)
    if (source && ready) drawMediaFitted(ctx, source, CW, CH, fitCfg)
  }, [ready, fitCfg])

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!onPan) return
      const source = sourceRef.current
      if (!source) return
      const srcW =
        source instanceof HTMLVideoElement
          ? source.videoWidth
          : source.naturalWidth
      const srcH =
        source instanceof HTMLVideoElement
          ? source.videoHeight
          : source.naturalHeight
      const placement = computeFitPlacement(srcW, srcH, CW, CH, fitCfg)
      if (!placement || !placement.overflows) return
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startFocalX: item.focalX ?? 0.5,
        startFocalY: item.focalY ?? 0.5,
        overflowX: placement.dw / CW,
        overflowY: placement.dh / CH,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [onPan, fitCfg, item.focalX, item.focalY]
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = dragRef.current
      if (!d || !onPan) return
      const rect = e.currentTarget.getBoundingClientRect()
      const dxNorm = (e.clientX - d.startX) / rect.width
      const dyNorm = (e.clientY - d.startY) / rect.height
      // Grab-drag: dragging right reveals more of the left, so focal moves left.
      const clamp = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
      const fx =
        d.overflowX > 1
          ? clamp(d.startFocalX - dxNorm / (d.overflowX - 1))
          : d.startFocalX
      const fy =
        d.overflowY > 1
          ? clamp(d.startFocalY - dyNorm / (d.overflowY - 1))
          : d.startFocalY
      onPan(fx, fy)
    },
    [onPan]
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    },
    []
  )

  return (
    <div className="relative overflow-hidden rounded border border-border bg-black">
      <canvas
        ref={canvasRef}
        width={CW}
        height={CH}
        className={cn(
          "aspect-video w-full",
          onPan ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {onPan && (
        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/50 px-1 py-0.5 text-[0.5rem] text-white/80">
          Drag to pan
        </span>
      )}
    </div>
  )
}
