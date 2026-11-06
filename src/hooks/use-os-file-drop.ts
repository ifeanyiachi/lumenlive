import { useEffect, useRef, useState, type RefObject } from "react"
import { toast } from "sonner"
import type { MediaAsset, MediaType } from "@/types/media"
import { pathsToAssets, filesToAssets, isTauri } from "@/lib/media-import"

/**
 * Global OS file-drop registry.
 *
 * Under Tauri there is exactly one webview-level `onDragDropEvent`, so a single
 * shared listener dispatches to whichever registered zone sits under the cursor
 * (topmost / smallest-area wins). This mirrors the in-app pointer-drag zone
 * registry in `drag-store`, and lets many drop targets coexist with different
 * accept-filters and drop behaviours. In the browser there is no global event,
 * so each zone falls back to HTML5 handlers returned as `dropHandlers`.
 */

interface Zone {
  el: HTMLElement
  accept: Set<MediaType>
  onDrop: (assets: MediaAsset[]) => void
  setOver: (over: boolean) => void
}

const zones = new Map<string, Zone>()
let overZoneId: string | null = null
let seq = 0

let unlisten: (() => void) | null = null
let listenerInit = false

/** The registered zone under (x, y), preferring the smallest (most specific) one. */
function hitTest(x: number, y: number): string | null {
  let best: string | null = null
  let bestArea = Infinity
  for (const [id, zone] of zones) {
    const r = zone.el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      const area = r.width * r.height
      if (area < bestArea) {
        bestArea = area
        best = id
      }
    }
  }
  return best
}

function setOverZone(id: string | null) {
  if (overZoneId === id) return
  if (overZoneId) zones.get(overZoneId)?.setOver(false)
  overZoneId = id
  if (id) zones.get(id)?.setOver(true)
}

async function dispatchDrop(id: string, paths: string[]) {
  const zone = zones.get(id)
  if (!zone) return
  const assets = await pathsToAssets(paths)
  const accepted = assets.filter((a) => zone.accept.has(a.type))
  if (accepted.length === 0) {
    toast.error("No supported files found")
    return
  }
  zone.onDrop(accepted)
  const skipped = assets.length - accepted.length
  if (skipped > 0) {
    toast.info(
      `${skipped} file${skipped > 1 ? "s" : ""} not supported here and skipped`
    )
  }
}

async function ensureListener() {
  if (!isTauri || listenerInit) return
  listenerInit = true
  try {
    const { getCurrentWebviewWindow } =
      await import("@tauri-apps/api/webviewWindow")
    const webview = getCurrentWebviewWindow()
    const un = await webview.onDragDropEvent((event) => {
      const p = event.payload
      // `position` is in PHYSICAL pixels; `getBoundingClientRect` (used by
      // hitTest) is in CSS/logical pixels. On displays scaled above 100% these
      // differ by the device pixel ratio, so convert before hit-testing.
      const dpr = window.devicePixelRatio || 1
      if (p.type === "over") {
        setOverZone(hitTest(p.position.x / dpr, p.position.y / dpr))
      } else if (p.type === "leave") {
        setOverZone(null)
      } else if (p.type === "drop") {
        const id = hitTest(p.position.x / dpr, p.position.y / dpr)
        setOverZone(null)
        if (id && p.paths.length > 0) void dispatchDrop(id, p.paths)
      }
    })
    // All zones may have unmounted while we awaited registration.
    if (zones.size === 0) {
      un()
      listenerInit = false
      return
    }
    unlisten = un
  } catch {
    listenerInit = false
  }
}

function releaseListenerIfIdle() {
  if (zones.size === 0 && unlisten) {
    unlisten()
    unlisten = null
    listenerInit = false
    overZoneId = null
  }
}

interface UseOsFileDropOptions {
  /** Media kinds this zone will keep; others in the same drop are skipped. */
  accept: MediaType[]
  /** Called with the accepted assets once a drop lands on this zone. */
  onDrop: (assets: MediaAsset[]) => void
}

/**
 * Register `ref`'s element as an OS file-drop target.
 * Returns `isOver` for highlighting and, in the browser, `dropHandlers` to
 * spread onto the element (no-op under Tauri, where the global listener drives).
 */
export function useOsFileDrop(
  ref: RefObject<HTMLElement | null>,
  { accept, onDrop }: UseOsFileDropOptions
) {
  const [isOver, setIsOver] = useState(false)
  const acceptKey = accept.join(",")

  const onDropRef = useRef(onDrop)
  useEffect(() => {
    onDropRef.current = onDrop
  })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const id = `osdrop-${seq++}`
    zones.set(id, {
      el,
      accept: new Set(acceptKey.split(",").filter(Boolean) as MediaType[]),
      onDrop: (assets) => onDropRef.current(assets),
      setOver: setIsOver,
    })
    void ensureListener()
    return () => {
      zones.delete(id)
      if (overZoneId === id) overZoneId = null
      releaseListenerIfIdle()
    }
  }, [ref, acceptKey])

  // Browser fallback: Tauri delivers OS files through the global listener above.
  const dropHandlers = isTauri
    ? undefined
    : {
        onDragOver: (e: React.DragEvent) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            setIsOver(true)
          }
        },
        onDragLeave: () => setIsOver(false),
        onDrop: (e: React.DragEvent) => {
          setIsOver(false)
          if (!e.dataTransfer.files.length) return
          e.preventDefault()
          const accepted = new Set(accept)
          void filesToAssets(e.dataTransfer.files).then((assets) => {
            const keep = assets.filter((a) => accepted.has(a.type))
            if (keep.length === 0) {
              toast.error("No supported files found")
              return
            }
            onDropRef.current(keep)
          })
        },
      }

  return { isOver, dropHandlers }
}
