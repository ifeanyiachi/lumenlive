import { createRoot } from "react-dom/client"
import { OutputWebLayer } from "@/components/broadcast/output-web-layer"
import { useStageClock } from "@/hooks/use-stage-clock"
import { useNdiKeepalive } from "@/hooks/use-ndi-keepalive"
import { useWindowSurface } from "@/hooks/use-window-surface"
import { useOutputRuntime, OUTPUT_MODE } from "@/components/broadcast-output/runtime"
import { useMediaPlayback } from "@/components/broadcast-output/hooks/use-media-playback"
import { useBroadcastEvents } from "@/components/broadcast-output/hooks/use-broadcast-events"

// This is a window entry point (defines the component and calls createRoot at
// the bottom), so it is not a Fast Refresh module boundary.
// eslint-disable-next-line react-refresh/only-export-components
function BroadcastCanvas() {
  // The shared spine: all 48 refs plus the core actions (draw, pushNdiFrame,
  // pushNdiBurst, startTransition, snapshots, …). Every listener reads and mutates
  // it; nothing here re-derives that state.
  const rt = useOutputRuntime()

  // The live media-video state machine (loop / end-action / progress echo),
  // driven by the same runtime. Stable across renders.
  const media = useMediaPlayback(rt)

  // The whole listener lifecycle — render loop + every subsystem's subscriptions +
  // one aggregated cleanup — lives here.
  useBroadcastEvents(rt, media)

  // Refs/actions consumed during render (JSX ref + the trailing hooks). Pulled out
  // of `rt` into locals so their ref provenance is legible to the linter.
  const {
    canvasRef,
    windowSizeRef,
    drawRef,
    stageDataRef,
    ndiConfigRef,
    lastPushRef,
    draw,
    pushNdiFrame,
  } = rt

  // Track the window's real inner size (native-mode resolution + reflow).
  useWindowSurface(windowSizeRef, drawRef)

  // Stage mode: tick every second to update the clock.
  useStageClock(OUTPUT_MODE === "stage", stageDataRef, draw, pushNdiFrame)

  // Slow keepalive: push one idle frame so NDI receivers don't drop the source.
  useNdiKeepalive(ndiConfigRef, lastPushRef, pushNdiFrame)

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          width: "100vw",
          height: "100vh",
          display: "block",
          objectFit: "contain",
        }}
      />
      <OutputWebLayer />
    </>
  )
}

const root = document.getElementById("broadcast-root")!
createRoot(root).render(<BroadcastCanvas />)
