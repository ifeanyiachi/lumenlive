import { create } from "zustand"
import { useEffect, useId, useRef, type RefObject } from "react"
import type { Verse } from "@/types"
import type { MediaAsset } from "@/types/media"

// Pointer-based drag-and-drop for in-app content (verses, media assets).
//
// WHY NOT HTML5 drag-and-drop: on Windows the Tauri/WRY native file-drop
// handler (`dragDropEnabled: true`, required by `use-os-file-drop` for OS file
// drops) disables the WebView2 HTML5 drag-and-drop API entirely — `dragover`
// never fires, so `preventDefault()` never runs and the cursor shows the
// "not-allowed" icon. This mirrors how schedule reordering is implemented with
// pointer events for the same reason.

export type DragPayload =
  | {
      kind: "verses"
      verses: Verse[]
      translation: string
      translationId: number
    }
  | { kind: "media"; assets: MediaAsset[] }
  | {
      kind: "slide"
      presentationId: string
      presentationName: string
      slideIndex?: number
    }
  | { kind: "song"; songId: string; songName: string; arrangementId?: string }

export type DragKind = DragPayload["kind"]

interface DropZone {
  accepts: DragKind[]
  getRect: () => DOMRect | null
  onDrop: (payload: DragPayload) => void
  onEnter?: () => void
}

// Non-reactive registry — zones register/unregister via effects; hit-testing
// reads live rects. Kept out of zustand state to avoid re-render churn.
const zones = new Map<string, DropZone>()

function hitTest(x: number, y: number, kind: DragKind): string | null {
  for (const [id, zone] of zones) {
    if (!zone.accepts.includes(kind)) continue
    const rect = zone.getRect()
    if (!rect) continue
    if (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    ) {
      return id
    }
  }
  return null
}

interface DragState {
  active: boolean
  payload: DragPayload | null
  x: number
  y: number
  label: string
  overZoneId: string | null
  start: (payload: DragPayload, x: number, y: number, label: string) => void
  move: (x: number, y: number) => void
  drop: () => void
  cancel: () => void
  registerZone: (id: string, zone: DropZone) => () => void
}

export const useDragStore = create<DragState>((set, get) => ({
  active: false,
  payload: null,
  x: 0,
  y: 0,
  label: "",
  overZoneId: null,

  start: (payload, x, y, label) => {
    set({
      active: true,
      payload,
      x,
      y,
      label,
      overZoneId: hitTest(x, y, payload.kind),
    })
  },

  move: (x, y) => {
    const { active, payload, overZoneId: prev } = get()
    if (!active || !payload) return
    const next = hitTest(x, y, payload.kind)
    if (next && next !== prev) zones.get(next)?.onEnter?.()
    set({ x, y, overZoneId: next })
  },

  drop: () => {
    const { active, overZoneId, payload } = get()
    if (active && overZoneId && payload) {
      zones.get(overZoneId)?.onDrop(payload)
    }
    set({ active: false, payload: null, overZoneId: null })
  },

  cancel: () => set({ active: false, payload: null, overZoneId: null }),

  registerZone: (id, zone) => {
    zones.set(id, zone)
    return () => {
      zones.delete(id)
    }
  },
}))

const DRAG_THRESHOLD = 6

interface PendingDrag {
  x: number
  y: number
  pointerId: number
  started: boolean
  build: () => { payload: DragPayload; label: string }
}

/**
 * Returns a factory that produces pointer-event handler props for a drag source.
 * Pass a `build` closure that lazily produces the drag payload + preview label
 * (evaluated once, when the drag actually starts). A drag begins only after the
 * pointer moves past a small threshold, so plain clicks still work; a click that
 * follows a real drag is swallowed via `onClickCapture`.
 */
export function useDragSource() {
  const pending = useRef<PendingDrag | null>(null)
  const justDragged = useRef(false)

  return (build: () => { payload: DragPayload; label: string }) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      pending.current = {
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
        started: false,
        build,
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = pending.current
      if (!d) return
      if (!d.started) {
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD)
          return
        d.started = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture(d.pointerId)
        } catch {
          /* noop */
        }
        const { payload, label } = d.build()
        useDragStore.getState().start(payload, e.clientX, e.clientY, label)
      } else {
        useDragStore.getState().move(e.clientX, e.clientY)
      }
    },
    onPointerUp: (e: React.PointerEvent) => {
      const d = pending.current
      pending.current = null
      if (d?.started) {
        useDragStore.getState().drop()
        justDragged.current = true
        try {
          ;(e.currentTarget as HTMLElement).releasePointerCapture(d.pointerId)
        } catch {
          /* noop */
        }
      }
    },
    onPointerCancel: () => {
      if (pending.current?.started) useDragStore.getState().cancel()
      pending.current = null
    },
    onClickCapture: (e: React.MouseEvent) => {
      if (justDragged.current) {
        justDragged.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
  })
}

/**
 * Registers `ref` as a drop target for the given drag `accepts` kinds. `onDrop`
 * fires when a matching drag is released over the element; `onEnter` fires when
 * the drag first moves over it (used to switch tabs). Returns whether a matching
 * drag is currently hovering the zone.
 */
export function useDropZone(
  ref: RefObject<HTMLElement | null>,
  handlers: {
    accepts: DragKind[]
    onDrop: (payload: DragPayload) => void
    onEnter?: () => void
  }
) {
  const id = useId()
  const onDrop = useRef(handlers.onDrop)
  const onEnter = useRef(handlers.onEnter)
  // accepts is static per zone; join to a stable key so the registration effect
  // re-runs if it ever changes.
  const acceptsKey = handlers.accepts.join(",")

  // Keep the latest callbacks without re-registering the zone every render.
  useEffect(() => {
    onDrop.current = handlers.onDrop
    onEnter.current = handlers.onEnter
  })

  useEffect(() => {
    return useDragStore.getState().registerZone(id, {
      accepts: acceptsKey.split(",").filter(Boolean) as DragKind[],
      getRect: () => ref.current?.getBoundingClientRect() ?? null,
      onDrop: (p) => onDrop.current(p),
      onEnter: () => onEnter.current?.(),
    })
  }, [id, ref, acceptsKey])

  return useDragStore((s) => s.active && s.overZoneId === id)
}
