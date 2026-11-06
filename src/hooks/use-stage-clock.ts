import { useEffect } from "react"
import type { StageDisplayData } from "@/lib/stage-display-renderer"

/**
 * Stage-monitor clock (S2 Phase 5). In stage mode the display shows a running
 * clock, so tick once a second to redraw (and push NDI) while stage data exists.
 * A no-op unless `enabled` (i.e. this window is a stage output).
 *
 * Refs are passed in (not owned) so the hook shares the output window's state;
 * `draw`/`pushNdiFrame` in the deps re-arm the interval if their identity changes,
 * matching the effect this was extracted from.
 */
export function useStageClock(
  enabled: boolean,
  stageDataRef: { current: StageDisplayData | null },
  draw: () => void,
  pushNdiFrame: () => void
): void {
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => {
      if (stageDataRef.current) {
        draw()
        void pushNdiFrame()
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [enabled, stageDataRef, draw, pushNdiFrame])
}
