import { useRef, useCallback, useState, useMemo } from "react"
import { useBroadcastStore } from "@/stores/broadcast-store"
import { anchorPosition } from "@/lib/verse-renderer"
import type { VerseLayoutMetrics } from "@/lib/verse-renderer"
import { computeSnaps, clamp } from "@/lib/snap-utils"
import type { SnapGuide } from "@/lib/snap-utils"
import { moveBox, resizeBoxCorner } from "@/lib/canvas-editor/box-transform"
import type { BoxCorner } from "@/lib/canvas-editor/box-transform"
import type { BroadcastTheme } from "@/types"

type DragMode =
  "move" | "resize-nw" | "resize-ne" | "resize-sw" | "resize-se" | null

const WS_WIDTH = 1920
const WS_HEIGHT = 1080
const HANDLE_SIZE = 8
const FIXED_IDS = new Set(["textArea", "verse", "reference"])

interface WsRect {
  left: number
  top: number
  width: number
  height: number
}

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
    const layout = draftTheme.layout
    const bgWpx = (layout.backgroundWidth / 100) * WS_WIDTH
    const bgHpx = (layout.backgroundHeight / 100) * WS_HEIGHT
    const taWpx = (layout.textAreaWidth / 100) * bgWpx
    const taHpx = (layout.textAreaHeight / 100) * bgHpx
    const pos = anchorPosition(
      layout.anchor,
      taWpx,
      taHpx,
      WS_WIDTH,
      WS_HEIGHT,
      layout.offsetX,
      layout.offsetY
    )
    return {
      x: (pos.x / WS_WIDTH) * 100,
      y: (pos.y / WS_HEIGHT) * 100,
      width: (taWpx / WS_WIDTH) * 100,
      height: (taHpx / WS_HEIGHT) * 100,
    }
  }, [draftTheme])

  const versePct = useMemo(
    () =>
      m?.verseRect
        ? {
            x: (m.verseRect.x / WS_WIDTH) * 100,
            y: (m.verseRect.y / WS_HEIGHT) * 100,
            width: (m.verseRect.width / WS_WIDTH) * 100,
            height: (m.verseRect.height / WS_HEIGHT) * 100,
          }
        : null,
    [m]
  )
  const refPct = useMemo(
    () =>
      m?.referenceRect
        ? {
            x: (m.referenceRect.x / WS_WIDTH) * 100,
            y: (m.referenceRect.y / WS_HEIGHT) * 100,
            width: (m.referenceRect.width / WS_WIDTH) * 100,
            height: (m.referenceRect.height / WS_HEIGHT) * 100,
          }
        : null,
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
      {(draftTheme.elements ?? [])
        .filter(
          (el) =>
            el.visible &&
            !(
              el.type === "shape" &&
              el.maskTargetId &&
              selectedElement !== el.id
            )
        )
        .map((el) => {
          const isMask = el.type === "shape" && !!el.maskTargetId
          const elScreen = {
            left: wsRect.left + (el.x / WS_WIDTH) * wsRect.width,
            top: wsRect.top + (el.y / WS_HEIGHT) * wsRect.height,
            width: (el.width / WS_WIDTH) * wsRect.width,
            height: (el.height / WS_HEIGHT) * wsRect.height,
          }
          const isSelected = selectedElement === el.id
          return (
            <div key={el.id}>
              <div
                className={`absolute border transition-colors ${
                  isSelected
                    ? isMask
                      ? "border-2 border-dashed border-blue-400"
                      : "border-2 border-primary"
                    : "border-transparent hover:border-white/30"
                }`}
                style={{
                  left: elScreen.left,
                  top: elScreen.top,
                  width: elScreen.width,
                  height: elScreen.height,
                  cursor: el.locked
                    ? "not-allowed"
                    : dragMode
                      ? undefined
                      : "grab",
                }}
                onPointerDown={(e) =>
                  handleElementPointerDown(e, el.id, "move")
                }
                onClick={(e) => e.stopPropagation()}
              />
              {isSelected && !el.locked && (
                <>
                  {(
                    [
                      [
                        "resize-nw",
                        "nw-resize",
                        { left: elScreen.left, top: elScreen.top },
                      ],
                      [
                        "resize-ne",
                        "ne-resize",
                        {
                          left: elScreen.left + elScreen.width - HANDLE_SIZE,
                          top: elScreen.top,
                        },
                      ],
                      [
                        "resize-sw",
                        "sw-resize",
                        {
                          left: elScreen.left,
                          top: elScreen.top + elScreen.height - HANDLE_SIZE,
                        },
                      ],
                      [
                        "resize-se",
                        "se-resize",
                        {
                          left: elScreen.left + elScreen.width - HANDLE_SIZE,
                          top: elScreen.top + elScreen.height - HANDLE_SIZE,
                        },
                      ],
                    ] as [DragMode, string, React.CSSProperties][]
                  ).map(([mode, cursor, style]) => (
                    <div
                      key={`${el.id}-${mode}`}
                      className="absolute border border-primary-foreground bg-primary"
                      style={{
                        ...style,
                        width: HANDLE_SIZE,
                        height: HANDLE_SIZE,
                        cursor,
                      }}
                      onPointerDown={(e) =>
                        handleElementPointerDown(e, el.id, mode)
                      }
                    />
                  ))}
                </>
              )}
            </div>
          )
        })}

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

function resizeKeepingCornerFixed(
  anchor: BroadcastTheme["layout"]["anchor"],
  origOffsetX: number,
  origOffsetY: number,
  origWpx: number,
  origHpx: number,
  newWpx: number,
  newHpx: number,
  fixedCorner: "nw" | "ne" | "sw" | "se"
): { offsetX: number; offsetY: number } {
  const origBase = anchorPosition(
    anchor,
    origWpx,
    origHpx,
    WS_WIDTH,
    WS_HEIGHT,
    0,
    0
  )
  const newBase = anchorPosition(
    anchor,
    newWpx,
    newHpx,
    WS_WIDTH,
    WS_HEIGHT,
    0,
    0
  )

  const origAbsX = origBase.x + origOffsetX
  const origAbsY = origBase.y + origOffsetY

  let fixedX: number
  let fixedY: number
  switch (fixedCorner) {
    case "nw":
      fixedX = origAbsX
      fixedY = origAbsY
      break
    case "ne":
      fixedX = origAbsX + origWpx
      fixedY = origAbsY
      break
    case "sw":
      fixedX = origAbsX
      fixedY = origAbsY + origHpx
      break
    case "se":
      fixedX = origAbsX + origWpx
      fixedY = origAbsY + origHpx
      break
  }

  let newAbsX: number
  let newAbsY: number
  switch (fixedCorner) {
    case "nw":
      newAbsX = fixedX
      newAbsY = fixedY
      break
    case "ne":
      newAbsX = fixedX - newWpx
      newAbsY = fixedY
      break
    case "sw":
      newAbsX = fixedX
      newAbsY = fixedY - newHpx
      break
    case "se":
      newAbsX = fixedX - newWpx
      newAbsY = fixedY - newHpx
      break
  }

  return {
    offsetX: newAbsX - newBase.x,
    offsetY: newAbsY - newBase.y,
  }
}
