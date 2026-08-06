import { useEffect } from "react"
import { useDragStore } from "@/stores/drag-store"

/**
 * Floating cursor-following label shown while content is being dragged (verses
 * or media). Mounted once at the app root. Also suppresses text selection for
 * the duration of the drag (pointer-based drags would otherwise select text).
 */
export function DragGhost() {
  const active = useDragStore((s) => s.active)
  const x = useDragStore((s) => s.x)
  const y = useDragStore((s) => s.y)
  const label = useDragStore((s) => s.label)

  useEffect(() => {
    if (!active) return
    const prev = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.userSelect = prev
    }
  }, [active])

  if (!active) return null

  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-[240px] truncate rounded-md border border-primary/40 bg-primary/90 px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-lg"
      style={{ left: x + 12, top: y + 12 }}
    >
      {label}
    </div>
  )
}
