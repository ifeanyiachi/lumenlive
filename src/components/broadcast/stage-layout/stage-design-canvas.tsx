import { useCallback, useEffect, useRef, useState } from "react"
import { useBroadcastStore } from "@/stores"
import { StagePreviewCanvas } from "./stage-preview-canvas"
import {
  moveBox,
  resizeBoxCorner,
  type BoxCorner,
  type BoxRect,
} from "@/lib/canvas-editor/box-transform"
import { computeSnaps, type SnapGuide } from "@/lib/snap-utils"
import type { StageLayout } from "@/types/stage-layout"
import { cn } from "@/lib/utils"

const WS_W = 1920
const WS_H = 1080

interface LayerView {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  locked: boolean
}

/** Flatten a draft's visible layers (zones + elements) in stacking order. */
function visibleLayers(layout: StageLayout): LayerView[] {
  const out: LayerView[] = []
  for (const id of layout.layerOrder) {
    const zone = layout.zones.find((z) => z.id === id)
    const el = zone ? null : layout.elements.find((e) => e.id === id)
    const box = zone ?? el
    if (!box || !box.visible) continue
    out.push({
      id: box.id,
      name: box.name,
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      locked: box.locked,
    })
  }
  return out
}

const CORNERS: BoxCorner[] = ["nw", "ne", "sw", "se"]

type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; orig: BoxRect }
  | {
      mode: "resize"
      corner: BoxCorner
      id: string
      startX: number
      startY: number
      orig: BoxRect
    }
  | null

export function StageDesignCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const draft = useBroadcastStore((s) => s.draftStageLayout)
  const selectedZone = useBroadcastStore((s) => s.selectedZone)

  const [scale, setScale] = useState(0.3)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const dragRef = useRef<DragState>(null)
  const rafRef = useRef<number | null>(null)
  const pendingRef = useRef<{ id: string; rect: BoxRect } | null>(null)

  // Fit the 1920×1080 workspace inside the container (with a small margin).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fit = () => {
      const s = Math.min(el.offsetWidth / WS_W, el.offsetHeight / WS_H) * 0.94
      setScale(s > 0 ? s : 0.1)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // rAF-coalesced write: one draft update per frame, flushed on pointerup.
  const flush = useCallback(() => {
    rafRef.current = null
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    const store = useBroadcastStore.getState()
    const cur = store.draftStageLayout
    if (!cur) return
    const zi = cur.zones.findIndex((z) => z.id === pending.id)
    if (zi >= 0) {
      const zones = cur.zones.map((z, i) =>
        i === zi ? { ...z, ...pending.rect } : z
      )
      store.updateStageDraft({ zones })
      return
    }
    const ei = cur.elements.findIndex((e) => e.id === pending.id)
    if (ei >= 0) {
      const elements = cur.elements.map((e, i) =>
        i === ei ? { ...e, ...pending.rect } : e
      )
      store.updateStageDraft({ elements })
    }
  }, [])

  const scheduleRect = useCallback(
    (id: string, rect: BoxRect) => {
      pendingRef.current = { id, rect }
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush)
    },
    [flush]
  )

  // Window listeners stay mounted for the component's life and no-op unless a
  // drag is active (dragRef set). This avoids add/remove churn per gesture and
  // the self-referential cleanup that per-drag listeners would need.
  const onWindowMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dxPx = (e.clientX - drag.startX) / scale
      const dyPx = (e.clientY - drag.startY) / scale
      const cur = useBroadcastStore.getState().draftStageLayout
      if (!cur) return
      const others = visibleLayers(cur)
        .filter((l) => l.id !== drag.id)
        .map((l) => ({ x: l.x, y: l.y, width: l.width, height: l.height }))

      if (drag.mode === "move") {
        const { x, y } = moveBox(drag.orig, dxPx, dyPx)
        let rect: BoxRect = { ...drag.orig, x, y }
        const snap = computeSnaps(rect, others, "move", {
          bounds: { width: WS_W, height: WS_H },
        })
        rect = { ...rect, x: snap.snappedX ?? x, y: snap.snappedY ?? y }
        setGuides(snap.guides)
        scheduleRect(drag.id, rect)
      } else {
        const rect = resizeBoxCorner(drag.orig, drag.corner, dxPx, dyPx)
        setGuides([])
        scheduleRect(drag.id, rect)
      }
    },
    [scale, scheduleRect]
  )

  const onWindowUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setGuides([])
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    flush() // final commit
  }, [flush])

  useEffect(() => {
    window.addEventListener("pointermove", onWindowMove)
    window.addEventListener("pointerup", onWindowUp)
    return () => {
      window.removeEventListener("pointermove", onWindowMove)
      window.removeEventListener("pointerup", onWindowUp)
    }
  }, [onWindowMove, onWindowUp])

  const beginDrag = useCallback(
    (e: React.PointerEvent, layer: LayerView, corner: BoxCorner | null) => {
      e.stopPropagation()
      useBroadcastStore.getState().setSelectedZone(layer.id)
      if (layer.locked) return
      const orig: BoxRect = {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
      }
      dragRef.current = corner
        ? {
            mode: "resize",
            corner,
            id: layer.id,
            startX: e.clientX,
            startY: e.clientY,
            orig,
          }
        : {
            mode: "move",
            id: layer.id,
            startX: e.clientX,
            startY: e.clientY,
            orig,
          }
    },
    []
  )

  if (!draft) {
    return (
      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 items-center justify-center"
        style={{ background: "#18181b" }}
      >
        <p className="text-xs text-muted-foreground">
          Select a stage layout to begin editing
        </p>
      </div>
    )
  }

  const layers = visibleLayers(draft)
  const boxW = WS_W * scale
  const boxH = WS_H * scale

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      style={{ background: "#18181b" }}
      onPointerDown={() => useBroadcastStore.getState().setSelectedZone(null)}
    >
      <div
        className="relative shadow-2xl"
        style={{ width: boxW, height: boxH }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <StagePreviewCanvas layout={draft} />

        {/* Interaction overlay */}
        <div className="absolute inset-0">
          {layers.map((layer) => {
            const isSel = layer.id === selectedZone
            return (
              <div
                key={layer.id}
                onPointerDown={(e) => beginDrag(e, layer, null)}
                className={cn(
                  "absolute select-none",
                  layer.locked ? "cursor-not-allowed" : "cursor-move",
                  isSel
                    ? "ring-2 ring-primary"
                    : "ring-1 ring-white/20 hover:ring-white/40"
                )}
                style={{
                  left: layer.x * scale,
                  top: layer.y * scale,
                  width: layer.width * scale,
                  height: layer.height * scale,
                }}
              >
                {isSel &&
                  !layer.locked &&
                  CORNERS.map((corner) => (
                    <div
                      key={corner}
                      onPointerDown={(e) => beginDrag(e, layer, corner)}
                      className="absolute size-2.5 rounded-full border border-primary bg-background"
                      style={{
                        left: corner.includes("w") ? -5 : undefined,
                        right: corner.includes("e") ? -5 : undefined,
                        top: corner.includes("n") ? -5 : undefined,
                        bottom: corner.includes("s") ? -5 : undefined,
                        cursor:
                          corner === "nw" || corner === "se"
                            ? "nwse-resize"
                            : "nesw-resize",
                      }}
                    />
                  ))}
                <span className="pointer-events-none absolute top-0 left-0 max-w-full truncate bg-black/50 px-1 text-[0.5rem] text-white/80">
                  {layer.name}
                </span>
              </div>
            )
          })}

          {/* Snap guides */}
          {guides.map((g, i) =>
            g.axis === "x" ? (
              <div
                key={`gx-${i}`}
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
                style={{ left: g.position * scale }}
              />
            ) : (
              <div
                key={`gy-${i}`}
                className="pointer-events-none absolute right-0 left-0 h-px bg-primary"
                style={{ top: g.position * scale }}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
