/**
 * Verse-update listener: the scripture path. Caches the payload, tears down any
 * live media/slide video, (re)starts the verse theme's animated-background loop,
 * repaints, and bursts NDI. Moved verbatim from the output-window effect.
 */

import {
  listenOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import type { OutputRuntime } from "../runtime"
import { disposeSubscriptions, type EventDisposer } from "./registrar"

export function registerVerseListener(
  rt: OutputRuntime,
  renderLoop: RenderLoop
): EventDisposer {
  const unlisten = listenOutputEvent(BROADCAST_EVENTS.verseUpdate, (event) => {
    rt.latestData.current = event.payload
    rt.layerFilterRef.current = event.payload.layerFilter ?? null
    rt.activeMode.current = "verse"
    rt.latestSlide.current = null
    rt.latestMedia.current = null
    if (rt.videoRef.current) {
      rt.videoRef.current.pause()
      rt.videoRef.current.src = ""
    }
    if (rt.audioRef.current) {
      rt.audioRef.current.pause()
      rt.audioRef.current.src = ""
    }
    cancelAnimationFrame(rt.videoRafRef.current)
    renderLoop.deactivate("slideVideo")
    for (const [, v] of rt.videoCacheRef.current) {
      v.pause()
    }
    rt.preloadThemeImages(event.payload.theme)
    rt.logDebug("Received broadcast:verse-update", {
      hasVerse: Boolean(event.payload.verse),
      themeId: event.payload.theme.id,
    })
    // A procedural animated background is clock-driven, so it needs a
    // per-frame redraw (draw-only — it never pushed NDI on its own); static
    // backgrounds don't. Start/stop accordingly.
    renderLoop.deactivate("themeAnim")
    if (event.payload.theme.background.type === "animated") {
      renderLoop.activate("themeAnim", { push: false })
    }
    rt.draw()
    rt.pushNdiBurst()
    if (
      rt.mediaLayerRef.current?.mediaType === "video" &&
      rt.mediaLayerVideoRef.current
    ) {
      rt.startMediaLayerVideoLoop()
    }
  })

  return disposeSubscriptions([unlisten])
}
