/**
 * Visibility + backdrop listeners: stage-display data, mute, live-output
 * visibility (Black / Clear / Logo), and the central base/master theme. The base
 * theme drives the `baseVideo` render-loop reason when its background animates.
 * Moved verbatim from the output-window effect.
 */

import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import { OUTPUT_MODE, type OutputRuntime } from "../runtime"
import { disposeSubscriptions, type EventDisposer } from "./registrar"

export function registerVisibilityListeners(
  rt: OutputRuntime,
  renderLoop: RenderLoop
): EventDisposer {
  const unlistenStage = listenOutputEvent(
    BROADCAST_EVENTS.stageUpdate,
    (event) => {
      rt.stageDataRef.current = event.payload
      rt.logDebug("Received broadcast:stage-update")
      if (OUTPUT_MODE === "stage") {
        rt.draw()
        rt.pushNdiBurst()
      }
    }
  )

  const unlistenMute = listenOutputEvent(BROADCAST_EVENTS.mute, (event) => {
    rt.broadcastMutedRef.current = event.payload.muted
    if (rt.videoRef.current) {
      rt.videoRef.current.muted = event.payload.muted
    }
    if (rt.audioRef.current) {
      rt.audioRef.current.muted = event.payload.muted
    }
    rt.logDebug("Received broadcast:mute", { muted: event.payload.muted })
  })

  // Live-output visibility (Black / Clear / Logo). Stash into refs and repaint;
  // push a short NDI burst so the feed reflects the change even when idle. The
  // logo image is loaded lazily and only when its path changes.
  const unlistenVisibility = listenOutputEvent(
    BROADCAST_EVENTS.outputVisibility,
    (event) => {
      rt.blackoutRef.current = event.payload.blackout
      rt.clearForegroundRef.current = event.payload.clear
      rt.showLogoRef.current = event.payload.logo
      const path = event.payload.logoImagePath
      if (path !== rt.logoPathRef.current) {
        rt.logoPathRef.current = path
        rt.logoImgRef.current = null
        if (path) {
          const img = new Image()
          // Load CORS-clean so the logo doesn't taint the canvas. The projector
          // displays a tainted canvas fine, but NDI reads it back via
          // getImageData, which throws on a tainted canvas — silently dropping
          // the frame (logo shows on the projector but not on NDI). Tauri's
          // asset protocol serves the CORS headers this needs.
          img.crossOrigin = "anonymous"
          img.onload = () => {
            // Ignore a stale load if the path changed again meanwhile.
            if (rt.logoPathRef.current !== path) return
            rt.logoImgRef.current = img
            rt.drawRef.current()
            rt.pushNdiBurst()
          }
          img.src = safeFileSrc(path)
        }
      }
      rt.logDebug("Received broadcast:output-visibility", event.payload)
      rt.drawRef.current()
      rt.pushNdiBurst()
    }
  )

  // Central base/master theme — the backdrop for Clear and transparent content.
  // Preload its images so renderVerse can paint the background immediately.
  const unlistenBaseTheme = listenOutputEvent(
    BROADCAST_EVENTS.baseTheme,
    (event) => {
      rt.baseThemeRef.current = event.payload.theme
      rt.preloadBaseThemeImages(event.payload.theme)
      // A video or procedural animated base background needs a per-frame
      // redraw (draw-only — it never pushed NDI on its own); static backgrounds
      // (solid/gradient/image/theme) don't.
      renderLoop.deactivate("baseVideo")
      const baseBg = event.payload.theme.background
      // The base backdrop renders through `renderSlide` now (RF3a), which draws a
      // video background from the LIVE video cache — not the image cache. So create,
      // load, and play the base video into that cache (mirroring the slide-listener),
      // then the `baseVideo` loop samples the current frame every draw.
      if (baseBg.type === "video" && baseBg.videoUrl) {
        const url = baseBg.videoUrl
        const cached = rt.videoCacheRef.current.get(url)
        if (cached) {
          cached.currentTime = 0
          void cached.play()
        } else {
          const video = document.createElement("video")
          video.crossOrigin = "anonymous"
          video.muted = true
          video.loop = true
          video.playsInline = true
          video.src = url
          video.onloadeddata = () => {
            rt.videoCacheRef.current.set(url, video)
            void video.play()
            rt.drawRef.current()
          }
          video.load()
        }
        renderLoop.activate("baseVideo", { push: false })
      } else if (baseBg.type === "animated") {
        renderLoop.activate("baseVideo", { push: false })
      }
      rt.logDebug("Received broadcast:base-theme", {
        themeId: event.payload.theme.id,
      })
      rt.drawRef.current()
      rt.pushNdiBurst()
    }
  )

  return disposeSubscriptions([
    unlistenStage,
    unlistenMute,
    unlistenVisibility,
    unlistenBaseTheme,
  ])
}
