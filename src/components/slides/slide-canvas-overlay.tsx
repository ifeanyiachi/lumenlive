import {
  useRef,
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
} from "react"
import { usePresentationStore } from "@/stores/presentation-store"
import { computeSnaps, clamp } from "@/lib/snap-utils"
import type { SnapGuide } from "@/lib/snap-utils"
import type { SlideElement, SlideTextElement } from "@/types/slide"

type DragMode =
  | "move"
  | "resize-nw"
  | "resize-ne"
  | "resize-sw"
  | "resize-se"
  | "rotate"
  | null

const HANDLE_SIZE = 8
const ROTATION_HANDLE_OFFSET = 24

export function SlideCanvasOverlay({
  canvasRef,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const activeSlide = usePresentationStore(
    (s) => s.draftPresentation?.slides[s.activeSlideIndex] ?? null
  )
  const selectedElementId = usePresentationStore((s) => s.selectedElementId)
  const multiSelectedIds = usePresentationStore((s) => s.selectedElementIds)
  const editingTextElementId = usePresentationStore(
    (s) => s.editingTextElementId
  )
  const overlayRef = useRef<HTMLDivElement>(null)
  const [dragMode, setDragMode] = useState<DragMode>(null)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const dragStart = useRef<{ mx: number; my: number; el: SlideElement } | null>(
    null
  )

  // Drag commits are coalesced to at most one store write per animation frame.
  // Each pointermove records the desired end-state here; a rAF flush applies it
  // in a single batched mutation, so a burst of pointer events (and every element
  // in a multi-selection) collapses into one presentation rebuild per frame
  // instead of one rebuild per element per event.
  const pendingDrag = useRef<{
    updates: Record<string, Partial<SlideElement>>
    guides?: SnapGuide[]
  } | null>(null)
  const dragRaf = useRef<number | null>(null)

  const flushDrag = useCallback(() => {
    dragRaf.current = null
    const pending = pendingDrag.current
    if (!pending) return
    pendingDrag.current = null
    usePresentationStore.getState().updateDraftElementsBatch(pending.updates)
    if (pending.guides !== undefined) setSnapGuides(pending.guides)
  }, [])

  const scheduleDrag = useCallback(
    (updates: Record<string, Partial<SlideElement>>, guides?: SnapGuide[]) => {
      pendingDrag.current = { updates, guides }
      if (dragRaf.current === null)
        dragRaf.current = requestAnimationFrame(flushDrag)
    },
    [flushDrag]
  )

  // Cancel any in-flight frame if the overlay unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (dragRaf.current !== null) cancelAnimationFrame(dragRaf.current)
    }
  }, [])

  const getCanvasRect = useCallback(() => {
    return canvasRef.current?.getBoundingClientRect() ?? null
  }, [canvasRef])

  const toPercent = useCallback(
    (clientX: number, clientY: number) => {
      const rect = getCanvasRect()
      if (!rect) return null
      return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100,
      }
    },
    [getCanvasRect]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, mode: DragMode, elementId: string) => {
      e.stopPropagation()
      e.preventDefault()
      const el = activeSlide?.elements.find((el) => el.id === elementId)
      if (!el || el.locked) return

      if (e.shiftKey && mode === "move") {
        usePresentationStore.getState().toggleSelectElement(elementId)
      } else {
        usePresentationStore.getState().clearMultiSelect()
        usePresentationStore.getState().setSelectedElement(elementId)
      }

      setDragMode(mode)
      dragStart.current = {
        mx: e.clientX,
        my: e.clientY,
        el: { ...el } as SlideElement,
      }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [activeSlide]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragMode || !dragStart.current) return
      const rect = getCanvasRect()
      if (!rect) return

      const dx = ((e.clientX - dragStart.current.mx) / rect.width) * 100
      const dy = ((e.clientY - dragStart.current.my) / rect.height) * 100
      const orig = dragStart.current.el

      const otherElements = (activeSlide?.elements ?? []).filter(
        (el) => el.id !== orig.id
      )

      let updates: Partial<SlideElement> = {}
      // Extra per-element patches (multi-selection move) applied in the same
      // batched commit as the primary element.
      const batched: Record<string, Partial<SlideElement>> = {}
      let moveGuides: SnapGuide[] | undefined

      switch (dragMode) {
        case "move": {
          let newX = clamp(orig.x + dx, 0, 100 - orig.width)
          let newY = clamp(orig.y + dy, 0, 100 - orig.height)
          const { snappedX, snappedY, guides } = computeSnaps(
            { x: newX, y: newY, width: orig.width, height: orig.height },
            otherElements,
            dragMode
          )
          if (snappedX !== null) newX = snappedX
          if (snappedY !== null) newY = snappedY
          moveGuides = guides

          const multiIds = usePresentationStore.getState().selectedElementIds
          if (multiIds.length > 1) {
            const moveDx = newX - orig.x
            const moveDy = newY - orig.y
            for (const otherId of multiIds) {
              if (otherId === orig.id) continue
              const otherEl = activeSlide?.elements.find(
                (e) => e.id === otherId
              )
              if (otherEl && !otherEl.locked) {
                batched[otherId] = {
                  x: clamp(otherEl.x + moveDx, 0, 100 - otherEl.width),
                  y: clamp(otherEl.y + moveDy, 0, 100 - otherEl.height),
                }
              }
            }
          }

          updates = { x: newX, y: newY }
          break
        }
        case "rotate": {
          const elCx = ((orig.x + orig.width / 2) / 100) * rect.width
          const elCy = ((orig.y + orig.height / 2) / 100) * rect.height
          const angle = Math.atan2(
            e.clientY - rect.top - elCy,
            e.clientX - rect.left - elCx
          )
          const degrees = Math.round((angle * 180) / Math.PI + 90)
          updates = { rotation: ((degrees % 360) + 360) % 360 }
          break
        }
        case "resize-nw": {
          const newX = clamp(orig.x + dx, 0, orig.x + orig.width - 2)
          const newY = clamp(orig.y + dy, 0, orig.y + orig.height - 2)
          updates = {
            x: newX,
            y: newY,
            width: orig.width - (newX - orig.x),
            height: orig.height - (newY - orig.y),
          }
          break
        }
        case "resize-ne": {
          const newY = clamp(orig.y + dy, 0, orig.y + orig.height - 2)
          const newW = clamp(orig.width + dx, 2, 100 - orig.x)
          updates = {
            y: newY,
            width: newW,
            height: orig.height - (newY - orig.y),
          }
          break
        }
        case "resize-sw": {
          const newX = clamp(orig.x + dx, 0, orig.x + orig.width - 2)
          const newH = clamp(orig.height + dy, 2, 100 - orig.y)
          updates = {
            x: newX,
            width: orig.width - (newX - orig.x),
            height: newH,
          }
          break
        }
        case "resize-se": {
          const newW = clamp(orig.width + dx, 2, 100 - orig.x)
          const newH = clamp(orig.height + dy, 2, 100 - orig.y)
          updates = { width: newW, height: newH }
          break
        }
      }

      batched[orig.id] = updates
      scheduleDrag(
        batched,
        dragMode === "move" ? (moveGuides ?? []) : undefined
      )
    },
    [dragMode, getCanvasRect, activeSlide, scheduleDrag]
  )

  const handlePointerUp = useCallback(() => {
    // Land the final drag position immediately rather than waiting for the next
    // frame, then tear down the gesture.
    if (dragRaf.current !== null) {
      cancelAnimationFrame(dragRaf.current)
      dragRaf.current = null
    }
    flushDrag()
    setDragMode(null)
    setSnapGuides([])
    dragStart.current = null
  }, [flushDrag])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      const pos = toPercent(e.clientX, e.clientY)
      if (!pos || !activeSlide) return

      const clicked = [...activeSlide.elements]
        .reverse()
        .find(
          (el) =>
            el.visible !== false &&
            pos.x >= el.x &&
            pos.x <= el.x + el.width &&
            pos.y >= el.y &&
            pos.y <= el.y + el.height
        )

      if (e.shiftKey && clicked) {
        usePresentationStore.getState().toggleSelectElement(clicked.id)
      } else {
        usePresentationStore.getState().clearMultiSelect()
        usePresentationStore.getState().setSelectedElement(clicked?.id ?? null)
      }
    },
    [activeSlide, toPercent]
  )

  if (!activeSlide) return null

  const selectedElement = activeSlide.elements.find(
    (e) => e.id === selectedElementId
  )
  const editingElement = activeSlide.elements.find(
    (e): e is SlideTextElement =>
      e.id === editingTextElementId && e.type === "text"
  )

  return (
    <div
      ref={overlayRef}
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
              left: `${guide.position}%`,
              width: 1,
              backgroundColor: "rgba(59, 130, 246, 0.7)",
            }}
          />
        ) : (
          <div
            key={`guide-${i}`}
            className="pointer-events-none absolute right-0 left-0"
            style={{
              top: `${guide.position}%`,
              height: 1,
              backgroundColor: "rgba(59, 130, 246, 0.7)",
            }}
          />
        )
      )}

      {activeSlide.elements.map((el) => {
        if (el.visible === false) return null
        const isMultiSelected =
          multiSelectedIds.length > 1 &&
          multiSelectedIds.includes(el.id) &&
          el.id !== selectedElementId
        return (
          <div
            key={el.id}
            className={`absolute border transition-colors ${isMultiSelected ? "border-dashed border-primary/60" : "border-transparent hover:border-white/30"}`}
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.width}%`,
              height: `${el.height}%`,
              cursor: el.locked ? "not-allowed" : dragMode ? undefined : "grab",
            }}
            onPointerDown={(e) => handlePointerDown(e, "move", el.id)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              if (el.type !== "text" || el.locked) return
              e.stopPropagation()
              usePresentationStore.getState().beginTextEdit(el.id)
            }}
          />
        )
      })}

      {selectedElement && selectedElement.id !== editingTextElementId && (
        <>
          {/* Selection border */}
          <div
            className="pointer-events-none absolute border-2 border-primary"
            style={{
              left: `${selectedElement.x}%`,
              top: `${selectedElement.y}%`,
              width: `${selectedElement.width}%`,
              height: `${selectedElement.height}%`,
            }}
          />

          {/* Rotation handle */}
          {!selectedElement.locked && (
            <div
              className="pointer-events-none absolute flex flex-col items-center"
              style={{
                left: `${selectedElement.x + selectedElement.width / 2}%`,
                top: `${selectedElement.y}%`,
                transform: `translate(-50%, -${ROTATION_HANDLE_OFFSET + 8}px)`,
              }}
            >
              <div
                className="pointer-events-auto h-3 w-3 rounded-full border border-primary-foreground bg-primary"
                style={{ cursor: "grab" }}
                onPointerDown={(e) =>
                  handlePointerDown(e, "rotate", selectedElement.id)
                }
              />
              <div
                className="pointer-events-none w-px bg-primary"
                style={{ height: `${ROTATION_HANDLE_OFFSET - 4}px` }}
              />
            </div>
          )}

          {/* Resize handles (hidden if locked) */}
          {!selectedElement.locked &&
            (
              [
                [
                  "resize-nw",
                  "nw-resize",
                  {
                    left: `${selectedElement.x}%`,
                    top: `${selectedElement.y}%`,
                  },
                ],
                [
                  "resize-ne",
                  "ne-resize",
                  {
                    left: `calc(${selectedElement.x + selectedElement.width}% - ${HANDLE_SIZE}px)`,
                    top: `${selectedElement.y}%`,
                  },
                ],
                [
                  "resize-sw",
                  "sw-resize",
                  {
                    left: `${selectedElement.x}%`,
                    top: `calc(${selectedElement.y + selectedElement.height}% - ${HANDLE_SIZE}px)`,
                  },
                ],
                [
                  "resize-se",
                  "se-resize",
                  {
                    left: `calc(${selectedElement.x + selectedElement.width}% - ${HANDLE_SIZE}px)`,
                    top: `calc(${selectedElement.y + selectedElement.height}% - ${HANDLE_SIZE}px)`,
                  },
                ],
              ] as [DragMode, string, React.CSSProperties][]
            ).map(([mode, cursor, style]) => (
              <div
                key={mode}
                className="absolute border border-primary-foreground bg-primary"
                style={{
                  ...style,
                  width: HANDLE_SIZE,
                  height: HANDLE_SIZE,
                  cursor,
                }}
                onPointerDown={(e) =>
                  // handlePointerDown writes dragStart.current inside the pointer
                  // event (after commit), not during render — false positive.
                  // eslint-disable-next-line react-hooks/refs
                  handlePointerDown(e, mode, selectedElement.id)
                }
              />
            ))}
        </>
      )}

      {editingElement && (
        <InlineTextEditor
          key={editingElement.id}
          element={editingElement}
          canvasRef={canvasRef}
        />
      )}
    </div>
  )
}

/**
 * Inline (on-canvas) text editor. Positioned over the element's box and styled
 * to approximate the baked canvas text, so double-clicking a text element lets
 * you edit it in place. The edited text is kept in local state and only written
 * to the store on commit — Enter (Shift+Enter inserts a newline) or blur commit;
 * Escape cancels and restores the original. The canvas hides this element's
 * baked text while editing, so this `<textarea>` is the only visible copy.
 */
function InlineTextEditor({
  element,
  canvasRef,
}: {
  element: SlideTextElement
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const [value, setValue] = useState(element.text)
  // Canvas is authored at 1080px tall; font/letter metrics are in that space and
  // must be scaled to the on-screen canvas size (which changes with zoom/resize).
  const [scale, setScale] = useState(1)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Escape cancels, but clearing the edit unmounts the textarea and fires blur
  // (→ commit) — which would save the discarded text. This one-shot latch lets
  // whichever of commit/cancel runs first win and ignores the trailing blur.
  const settledRef = useRef(false)

  useLayoutEffect(() => {
    const measure = () => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect && rect.height > 0) setScale(rect.height / 1080)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [canvasRef])

  // Auto-grow to fit content so the flex wrapper can vertical-align it, matching
  // the element's verticalAlign closely while typing.
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = `${ta.scrollHeight}px`
  }, [value, scale])

  // Focus and select all on open so typing immediately replaces the text.
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.focus()
    ta.select()
  }, [])

  const commit = () => {
    if (settledRef.current) return
    settledRef.current = true
    usePresentationStore.getState().commitTextEdit(element.id, value)
  }
  const cancel = () => {
    if (settledRef.current) return
    settledRef.current = true
    usePresentationStore.getState().cancelTextEdit()
  }

  const justify =
    element.verticalAlign === "top"
      ? "flex-start"
      : element.verticalAlign === "bottom"
        ? "flex-end"
        : "center"

  return (
    <div
      className="absolute flex flex-col"
      style={{
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        justifyContent: justify,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={value}
        spellCheck={false}
        className="w-full resize-none overflow-hidden border-none bg-transparent p-0 outline-none"
        style={{
          fontFamily: element.fontFamily,
          fontSize: element.fontSize * scale,
          fontWeight: element.bold ? 700 : element.fontWeight,
          fontStyle: element.italic ? "italic" : "normal",
          textDecoration: element.underline ? "underline" : "none",
          color: element.color,
          textAlign: element.horizontalAlign,
          lineHeight: element.lineHeight,
          letterSpacing: element.letterSpacing
            ? element.letterSpacing * scale
            : undefined,
          textTransform: element.textTransform,
        }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Keep Delete/undo and other editor shortcuts from firing while typing.
          e.stopPropagation()
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            cancel()
          }
        }}
      />
    </div>
  )
}
