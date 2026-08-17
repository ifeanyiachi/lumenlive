import { useRef, useState, useEffect, useMemo } from "react"

import {
  TrashIcon,
  GripVerticalIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  UnlockIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { usePresentationStore } from "@/stores/presentation-store"
import {
  captureLayerRowRects,
  pickLayerIndexAtY,
  type LayerRowRect,
} from "@/lib/slides/layer-drag"
import { elementLabel } from "@/lib/slides/element-meta"
import { cn } from "@/lib/utils"
import type { SlideElement } from "@/types/slide"

import { elementIcon } from "./element-meta"

export function LayerList({
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
