import { useEffect } from "react"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import type { Surface } from "@/lib/broadcast-output/surface"

/**
 * Track the output window's real inner size (S2 Phase 5). Native mode renders at
 * the true output resolution, so the window's device-pixel size is stashed in
 * `windowSizeRef` and refreshed whenever the window is resized or moved to another
 * monitor, triggering a redraw via `drawRef`.
 *
 * `drawRef` (not `draw`) is used so the resize subscription is registered once and
 * still calls the latest draw — matching the effect this was extracted from.
 */
export function useWindowSurface(
  windowSizeRef: { current: Surface | null },
  drawRef: { current: () => void }
): void {
  useEffect(() => {
    const win = getCurrentWebviewWindow()
    const applyWindowSize = (size: { width: number; height: number }) => {
      windowSizeRef.current = { width: size.width, height: size.height }
      drawRef.current()
    }
    void win
      .innerSize()
      .then(applyWindowSize)
      .catch(() => {})
    const unlistenResized = win.onResized((event) => {
      applyWindowSize(event.payload)
    })
    return () => {
      unlistenResized.then((fn) => fn())
    }
  }, [windowSizeRef, drawRef])
}
