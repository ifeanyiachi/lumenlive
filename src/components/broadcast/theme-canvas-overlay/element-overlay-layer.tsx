import type { BroadcastTheme } from "@/types"
import { WS_WIDTH, WS_HEIGHT } from "@/lib/canvas-editor/workspace-geometry"
import { HANDLE_SIZE, type DragMode, type WsRect } from "./types"

interface Props {
  elements: BroadcastTheme["elements"]
  wsRect: WsRect
  selectedElement: string | null
  dragMode: DragMode
  onElementPointerDown: (
    e: React.PointerEvent,
    elementId: string,
    mode: DragMode
  ) => void
}

/**
 * Selection outlines + drag/resize interaction for the theme's custom elements.
 * Pure presentation given the current drag state — all pointer state and the
 * store writes live in the overlay shell; this layer only renders boxes and
 * forwards pointer-down events. Extracted verbatim from the overlay's element
 * `.map`.
 */
export function ElementOverlayLayer({
  elements,
  wsRect,
  selectedElement,
  dragMode,
  onElementPointerDown,
}: Props) {
  return (
    <>
      {(elements ?? [])
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
                onPointerDown={(e) => onElementPointerDown(e, el.id, "move")}
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
                        onElementPointerDown(e, el.id, mode)
                      }
                    />
                  ))}
                </>
              )}
            </div>
          )
        })}
    </>
  )
}
