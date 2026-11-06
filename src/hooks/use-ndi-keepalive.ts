import { useEffect } from "react"
import type { NdiConfigEventPayload } from "@/types"

/**
 * NDI idle keepalive (S2 Phase 5). NDI receivers drop a source that goes quiet,
 * so when NDI is active but nothing has been pushed for >2s, push one frame.
 * Only fires while idle — active animation loops already push at frame rate.
 *
 * Refs are passed in (not owned) so the hook reads the output window's live NDI
 * config + last-push timestamp.
 */
export function useNdiKeepalive(
  ndiConfigRef: { current: NdiConfigEventPayload },
  lastPushRef: { current: number },
  pushNdiFrame: () => void
): void {
  useEffect(() => {
    const timer = setInterval(() => {
      if (!ndiConfigRef.current.active) return
      const elapsed = Date.now() - lastPushRef.current
      if (elapsed > 2000) void pushNdiFrame()
    }, 2000)
    return () => clearInterval(timer)
  }, [ndiConfigRef, lastPushRef, pushNdiFrame])
}
