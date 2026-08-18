import { useRef, useCallback, useState, useMemo } from "react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { anchorPosition } from "@/lib/verse-renderer"
import type { VerseLayoutMetrics } from "@/lib/verse-renderer"
import { computeSnaps, clamp } from "@/lib/snap-utils"
import type { SnapGuide } from "@/lib/snap-utils"
import { moveBox, resizeBoxCorner } from "@/lib/canvas-editor/box-transform"
import type { BoxCorner } from "@/lib/canvas-editor/box-transform"
import {
  WS_WIDTH,
  WS_HEIGHT,
  computeTextAreaPct,
  rectToPct,
  resizeKeepingCornerFixed,
} from "@/lib/canvas-editor/workspace-geometry"
import type { BroadcastTheme } from "@/types"
import { HANDLE_SIZE, type DragMode, type WsRect } from "./types"
import { ElementOverlayLayer } from "./element-overlay-layer"

const FIXED_IDS = new Set(["textArea", "verse", "reference"])

interface Props {
  wsRect: WsRect | null
  metrics: VerseLayoutMetrics | null
}

export function ThemeCanvasOverlay({ wsRect, metrics: m }: Props) {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const updateDraftNested = useBroadcastStore((s) => s.updateDraftNested)
  const regionLocked = useBroadcastStore((s) => s.regionLocked)
  const regionHidden = useBroadcastStore((s) => s.regionHidden)

  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const [dragTarget, setDragTarget] = useState<string | null>(null)
  const dragStart = useRef<{
    mx: number
    my: number
    origOffsetX: number
    origOffsetY: number
    origBgW: number
    origBgH: number
    origTaWpx: number
    origTaHpx: number
    anchor: BroadcastTheme["layout"]["anchor"]
  } | null>(null)
  const elDragStart = useRef<{
    mx: number
    my: number
    origX: number
    origY: number
    origW: number
    origH: number
    elementId: string
  } | null>(null)

  const textAreaPct = useMemo(() => {
    if (!draftTheme) return null
    return computeTextAreaPct(draftTheme.layout)
  }, [draftTheme])

  const versePct = useMemo(
    () => (m?.verseRect ? rectToPct(m.verseRect) : null),
    [m]
  )
  const refPct = useMemo(
    () => (m?.referenceRect ? rectToPct(m.referenceRect) : null),
    [m]
  )

  const isTextAreaLocked = regionLocked.has("textArea")
  const isVerseLocked = regionLocked.has("verse")
  const isReferenceLocked = regionLocked.has("reference")
  const isTextAreaHidden = regionHidden.has("textArea")
  const isVerseHidden = regionHidden.has("verse")
  const isReferenceHidden = regionHidden.has("reference")

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, regionId: string, mode: DragMode) => {
      e.stopPropagation()
      e.preventDefault()
      if (!draftTheme || !wsRect) return

      const lockId =
        regionId === "textArea"
          ? ("textArea" as const)
          : regionId === "verse"
            ? ("verse" as const)
            : ("reference" as const)
      if (regionLocked.has(lockId)) return

      if (regionId === "verse") {
        useBroadcastStore.getState().setSelectedElement("verse")
      } else if (regionId === "reference") {
        useBroadcastStore.getState().setSelectedElement("reference")
      } else if (regionId === "textArea") {
        useBroadcastStore.getState().setSelectedElement("textArea")
      }

      setDragMode(mode)
      const layout = draftTheme.layout
      const bgWpx = (layout.backgroundWidth / 100) * WS_WIDTH
      const bgHpx = (layout.backgroundHeight / 100) * WS_HEIGHT
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        origOffsetX: layout.offsetX,
        origOffsetY: layout.offsetY,
        origBgW: layout.backgroundWidth,
        origBgH: layout.backgroundHeight,
        origTaWpx: (layout.textAreaWidth / 100) * bgWpx,
        origTaHpx: (layout.textAreaHeight / 100) * bgHpx,
        anchor: layout.anchor,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [draftTheme, wsRect, regionLocked]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode || !wsRect) return

      if (elDragStart.current && dragTarget && !FIXED_IDS.has(dragTarget)) {
        const orig = elDragStart.current
        const scale = WS_WIDTH / wsRect.width
        const dxPx = (e.clientX - orig.mx) * scale
        const dyPx = (e.clientY - orig.my) * scale
        const store = useBroadcastStore.getState()
        const elIndex = (store.draftTheme?.elements ?? []).findIndex(
          (el) => el.id === orig.elementId
        )
        if (elIndex === -1) return
        const origBox = {
          x: orig.origX,
          y: orig.origY,
          width: orig.origW,
          height: orig.origH,
        }
        if (dragMode === "move") {
          const { x, y } = moveBox(origBox, dxPx, dyPx)
          store.updateDraftNested(`elements.${elIndex}.x`, x)
          store.updateDraftNested(`elements.${elIndex}.y`, y)
        } else if (dragMode.startsWith("resize-")) {
          const corner = dragMode.slice(7) as BoxCorner
          const next = resizeBoxCorner(origBox, corner, dxPx, dyPx)
          store.updateDraftNested(`elements.${elIndex}.x`, next.x)
          store.updateDraftNested(`elements.${elIndex}.y`, next.y)
          store.updateDraftNested(`elements.${elIndex}.width`, next.width)
          store.updateDraftNested(`elements.${elIndex}.height`, next.height)
        }
        return
      }

      if (!dragStart.current) return
      const dx = ((e.clientX - dragStart.current.mx) / wsRect.width) * 100
      const dy = ((e.clientY - dragStart.current.my) / wsRect.height) * 100
      const orig = dragStart.current

      if (dragMode === "move") {
        const origBase = anchorPosition(
          orig.anchor,
          orig.origTaWpx,
          orig.origTaHpx,
          WS_WIDTH,
          WS_HEIGHT,
          0,
          0
        )
        const origAbsX = ((origBase.x + orig.origOffsetX) / WS_WIDTH) * 100
        const origAbsY = ((origBase.y + orig.origOffsetY) / WS_HEIGHT) * 100

        let newAbsX = origAbsX + dx
        let newAbsY = origAbsY + dy

        const { snappedX, snappedY, guides } = computeSnaps(
          { x: newAbsX, y: newAbsY, width: orig.origBgW, height: orig.origBgH },
          [],
          "move"
        )
        if (snappedX !== null) newAbsX = snappedX
        if (snappedY !== null) newAbsY = snappedY
        setSnapGuides(guides)

        const newAbsXpx = (newAbsX / 100) * WS_WIDTH
        const newAbsYpx = (newAbsY / 100) * WS_HEIGHT
        updateDraftNested("layout.offsetX", newAbsXpx - origBase.x)
        updateDraftNested("layout.offsetY", newAbsYpx - origBase.y)
      } else if (dragMode.startsWith("resize-")) {
        const corner = dragMode.slice(7) as "nw" | "ne" | "sw" | "se"

        let newBgW = orig.origBgW
        let newBgH = orig.origBgH

        if (corner === "se" || corner === "ne")
          newBgW = clamp(orig.origBgW + dx, 10, 100)
        if (corner === "nw" || corner === "sw")
          newBgW = clamp(orig.origBgW - dx, 10, 100)
        if (corner === "se" || corner === "sw")
          newBgH = clamp(orig.origBgH + dy, 10, 100)
        if (corner === "nw" || corner === "ne")
          newBgH = clamp(orig.origBgH - dy, 10, 100)

        const taRatio = orig.origTaWpx / ((orig.origBgW / 100) * WS_WIDTH)
        const taRatioH = orig.origTaHpx / ((orig.origBgH / 100) * WS_HEIGHT)
        const newTaWpx = taRatio * (newBgW / 100) * WS_WIDTH
        const newTaHpx = taRatioH * (newBgH / 100) * WS_HEIGHT

        const fixedCorner =
          corner === "se"
            ? "nw"
            : corner === "nw"
              ? "se"
              : corner === "ne"
                ? "sw"
                : "ne"
        const { offsetX, offsetY } = resizeKeepingCornerFixed(
          orig.anchor,
          orig.origOffsetX,
          orig.origOffsetY,
          orig.origTaWpx,
          orig.origTaHpx,
          newTaWpx,
          newTaHpx,
          fixedCorner as "nw" | "ne" | "sw" | "se"
        )

        updateDraftNested("layout.backgroundWidth", newBgW)
        updateDraftNested("layout.backgroundHeight", newBgH)
        updateDraftNested("layout.offsetX", offsetX)
        updateDraftNested("layout.offsetY", offsetY)
      }
    },
    [dragMode, dragTarget, wsRect, updateDraftNested]
  )

  const handlePointerUp = useCallback(() => {
    setDragMode(null)
    setDragTarget(null)
    setSnapGuides([])
    dragStart.current = null
    elDragStart.current = null
  }, [])

  const handleElementPointerDown = useCallback(
    (e: React.PointerEvent, elementId: string, mode: DragMode) => {
      e.stopPropagation()
      e.preventDefault()
      if (!draftTheme || !wsRect) return
      const el = (draftTheme.elements ?? []).find((el) => el.id === elementId)
      if (!el || el.locked) return

      useBroadcastStore.getState().setSelectedElement(elementId)
      setDragMode(mode)
      setDragTarget(elementId)
      elDragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        origX: el.x,
        origY: el.y,
        origW: el.width,
        origH: el.height,
        elementId,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [draftTheme, wsRect]
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (!wsRect || !draftTheme) return
      const xPx = ((e.clientX - wsRect.left) / wsRect.width) * WS_WIDTH
      const yPx = ((e.clientY - wsRect.top) / wsRect.height) * WS_HEIGHT

      const elements = draftTheme.elements ?? []
      const layerOrder = draftTheme.layerOrder ?? []
      for (const id of layerOrder) {
        if (FIXED_IDS.has(id)) continue
        const el = elements.find((e) => e.id === id)
        if (!el || !el.visible) continue
        if (el.type === "shape" && el.maskTargetId) continue
        if (
          xPx >= el.x &&
          xPx <= el.x + el.width &&
          yPx >= el.y &&
          yPx <= el.y + el.height
        ) {
          useBroadcastStore.getState().setSelectedElement(id)
          return
        }
      }

      const x = (xPx / WS_WIDTH) * 100
      const y = (yPx / WS_HEIGHT) * 100
      if (
        refPct &&
        x >= refPct.x &&
        x <= refPct.x + refPct.width &&
        y >= refPct.y &&
        y <= refPct.y + refPct.height
      ) {
        useBroadcastStore.getState().setSelectedElement("reference")
        return
      }
      if (
        versePct &&
        x >= versePct.x &&
        x <= versePct.x + versePct.width &&
        y >= versePct.y &&
        y <= versePct.y + versePct.height
      ) {
        useBroadcastStore.getState().setSelectedElement("verse")
        return
      }
      useBroadcastStore.getState().setSelectedElement(null)
    },
    [wsRect, versePct, refPct, draftTheme]
  )

  if (!draftTheme || !wsRect || !textAreaPct) return null

  const toScreen = (
    xPct: number,
    yPct: number,
    wPct: number,
    hPct: number
  ) => ({
    left: wsRect.left + (xPct / 100) * wsRect.width,
    top: wsRect.top + (yPct / 100) * wsRect.height,
    width: (wPct / 100) * wsRect.width,
    height: (hPct / 100) * wsRect.height,
  })

  const taScreen = toScreen(
    textAreaPct.x,
    textAreaPct.y,
    textAreaPct.width,
    textAreaPct.height
  )
  const verseScreen = versePct
    ? toScreen(versePct.x, versePct.y, versePct.width, versePct.height)
    : null
  const refScreen = refPct
    ? toScreen(refPct.x, refPct.y, refPct.width, refPct.height)
    : null

  const handleResizeDown = (e: React.PointerEvent, mode: DragMode) => {
    e.stopPropagation()
    e.preventDefault()
    if (!draftTheme || isTextAreaLocked) return
    const layout = draftTheme.layout
    const bgWpx = (layout.backgroundWidth / 100) * WS_WIDTH
    const bgHpx = (layout.backgroundHeight / 100) * WS_HEIGHT
    setDragMode(mode)
    dragStart.current = {
      mx: e.clientX,
      my: e.clientY,
      origOffsetX: layout.offsetX,
      origOffsetY: layout.offsetY,
      origBgW: layout.backgroundWidth,
      origBgH: layout.backgroundHeight,
      origTaWpx: (layout.textAreaWidth / 100) * bgWpx,
      origTaHpx: (layout.textAreaHeight / 100) * bgHpx,
      anchor: layout.anchor,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  return (
    <div
      className="absolute inset-0"
      style={{ cursor: dragMode === "move" ? "grabbing" : "default" }}
      onClick={handleOverlayClick}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Snap guides */}
      {snapGuides.map((guide, i) =>
        guide.axis === "x" ? (
          <div
            key={`guide-${i}`}
            className="pointer-events-none absolute top-0 bottom-0"
            style={{
              left: wsRect.left + (guide.position / 100) * wsRect.width,
              width: 1,
              backgroundColor: "rgba(59, 130, 246, 0.7)",
            }}
          />
        ) : (
          <div
            key={`guide-${i}`}
            className="pointer-events-none absolute right-0 left-0"
            style={{
              top: wsRect.top + (guide.position / 100) * wsRect.height,
              height: 1,
              backgroundColor: "rgba(59, 130, 246, 0.7)",
            }}
          />
        )
      )}

      {/* Text area region — draggable + resizable. Outlined only when
          selected (or on hover), so selecting a single element no longer
          leaves the whole-text-block box drawn around everything. */}
      {!isTextAreaHidden && (
        <div
          className={`absolute border border-dashed transition-colors ${
            isTextAreaLocked
              ? "border-muted-foreground/30"
              : selectedElement === "textArea"
                ? "border-amber-500"
                : "border-transparent hover:border-amber-500/50"
          }`}
          style={{
            left: taScreen.left,
            top: taScreen.top,
            width: taScreen.width,
            height: taScreen.height,
            cursor: isTextAreaLocked
              ? "not-allowed"
              : dragMode
                ? undefined
                : "grab",
          }}
          onPointerDown={(e) => handlePointerDown(e, "textArea", "move")}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Verse region */}
      {verseScreen && !isVerseHidden && (
        <div
          className={`absolute border transition-colors ${
            selectedElement === "verse"
              ? "border-primary"
              : "border-transparent hover:border-white/30"
          }`}
          style={{
            left: verseScreen.left,
            top: verseScreen.top,
            width: verseScreen.width,
            height: verseScreen.height,
            cursor: isVerseLocked
              ? "not-allowed"
              : dragMode
                ? undefined
                : "grab",
          }}
          onPointerDown={(e) => handlePointerDown(e, "verse", "move")}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Reference region */}
      {refScreen && !isReferenceHidden && (
        <div
          className={`absolute border transition-colors ${
            selectedElement === "reference"
              ? "border-primary"
              : "border-transparent hover:border-white/30"
          }`}
          style={{
            left: refScreen.left,
            top: refScreen.top,
            width: refScreen.width,
            height: refScreen.height,
            cursor: isReferenceLocked
              ? "not-allowed"
              : dragMode
                ? undefined
                : "grab",
          }}
          onPointerDown={(e) => handlePointerDown(e, "reference", "move")}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Resize handles on text area corners — only when selected */}
      {!isTextAreaHidden &&
        !isTextAreaLocked &&
        selectedElement === "textArea" &&
        (
          [
            [
              "resize-nw",
              "nw-resize",
              { left: taScreen.left, top: taScreen.top },
            ],
            [
              "resize-ne",
              "ne-resize",
              {
                left: taScreen.left + taScreen.width - HANDLE_SIZE,
                top: taScreen.top,
              },
            ],
            [
              "resize-sw",
              "sw-resize",
              {
                left: taScreen.left,
                top: taScreen.top + taScreen.height - HANDLE_SIZE,
              },
            ],
            [
              "resize-se",
              "se-resize",
              {
                left: taScreen.left + taScreen.width - HANDLE_SIZE,
                top: taScreen.top + taScreen.height - HANDLE_SIZE,
              },
            ],
          ] as [DragMode, string, React.CSSProperties][]
        ).map(([mode, cursor, style]) => (
          <div
            key={mode}
            className="absolute border border-amber-600 bg-amber-500"
            style={{
              ...style,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              cursor,
            }}
            // handleResizeDown writes dragStart.current inside the pointer
            // event (after commit), not during render — false positive.
            // eslint-disable-next-line react-hooks/refs
            onPointerDown={(e) => handleResizeDown(e, mode)}
          />
        ))}

      {/* Custom elements — selection outlines + interaction */}
      <ElementOverlayLayer
        elements={draftTheme.elements}
        wsRect={wsRect}
        selectedElement={selectedElement}
        dragMode={dragMode}
        onElementPointerDown={handleElementPointerDown}
      />

      {/* Selected element highlight */}
      {selectedElement === "verse" && verseScreen && !isVerseHidden && (
        <div
          className="pointer-events-none absolute border-2 border-primary"
          style={{
            left: verseScreen.left,
            top: verseScreen.top,
            width: verseScreen.width,
            height: verseScreen.height,
          }}
        />
      )}
      {selectedElement === "reference" && refScreen && !isReferenceHidden && (
        <div
          className="pointer-events-none absolute border-2 border-primary"
          style={{
            left: refScreen.left,
            top: refScreen.top,
            width: refScreen.width,
            height: refScreen.height,
          }}
        />
      )}
    </div>
  )
}
