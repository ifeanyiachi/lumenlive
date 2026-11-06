/**
 * Overlay listeners: alerts (×3), countdowns (×5), props/marquee, and the media
 * layer. Alerts/countdowns/props mutate their active sets and repaint; countdown
 * and marquee spin up their per-frame render-loop reasons while any remain. Moved
 * verbatim from the output-window effect.
 */

import {
  preloadImage,
  ASSET_REVEAL_FALLBACK_MS,
} from "@/lib/broadcast-output/asset-cache"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
} from "@/services/broadcast-content-gateway"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import type { OutputRuntime } from "../runtime"
import { disposeSubscriptions, type EventDisposer } from "./registrar"

export function registerOverlayListeners(
  rt: OutputRuntime,
  renderLoop: RenderLoop
): EventDisposer {
  const unlistenAlert = listenOutputEvent(BROADCAST_EVENTS.alert, (event) => {
    rt.activeAlerts.current = [...rt.activeAlerts.current, event.payload]
    rt.logDebug("Received broadcast:alert", {
      message: event.payload.alert.message,
    })
    rt.draw()
    rt.pushNdiBurst()
  })

  const unlistenAlertDismiss = listenOutputEvent(
    BROADCAST_EVENTS.alertDismiss,
    (event) => {
      rt.activeAlerts.current = rt.activeAlerts.current.filter(
        (a) => a.alert.id !== event.payload.alertId
      )
      rt.logDebug("Received broadcast:alert-dismiss", {
        alertId: event.payload.alertId,
      })
      rt.draw()
      rt.pushNdiBurst()
    }
  )

  const unlistenAlertDismissAll = listenOutputEvent(
    BROADCAST_EVENTS.alertDismissAll,
    () => {
      rt.activeAlerts.current = []
      rt.logDebug("Received broadcast:alert-dismiss-all")
      rt.draw()
      rt.pushNdiBurst()
    }
  )

  // A countdown re-renders every frame (the time text changes), so the render
  // loop runs a "countdown" reason while any countdown is active; its keepAlive
  // self-stops (before the frame) once the set empties — the same shape as the
  // marquee ticker.
  const ensureCountdownLoop = () => {
    if (rt.activeCountdowns.current.length > 0) {
      renderLoop.activate("countdown", {
        keepAlive: () => rt.activeCountdowns.current.length > 0,
      })
    } else {
      renderLoop.deactivate("countdown")
    }
  }

  const unlistenCountdown = listenOutputEvent(
    BROADCAST_EVENTS.countdown,
    (event) => {
      rt.activeCountdowns.current = [
        ...rt.activeCountdowns.current,
        event.payload,
      ]
      rt.logDebug("Received broadcast:countdown", {
        label: event.payload.timer.label,
      })
      ensureCountdownLoop()
    }
  )

  // Pause/resume/±time all arrive as a full-state replace for one countdown.
  const unlistenCountdownUpdate = listenOutputEvent(
    BROADCAST_EVENTS.countdownUpdate,
    (event) => {
      rt.activeCountdowns.current = rt.activeCountdowns.current.map((c) =>
        c.countdown.id === event.payload.countdown.id ? event.payload : c
      )
      rt.logDebug("Received broadcast:countdown-update", {
        label: event.payload.timer.label,
        state: event.payload.countdown.state,
      })
      ensureCountdownLoop()
    }
  )

  // Full replace of the active set — sent when this window (re)announces
  // readiness so a countdown that started before it opened still appears.
  // Replace (not append) keeps already-synced windows from doubling entries.
  const unlistenCountdownSync = listenOutputEvent(
    BROADCAST_EVENTS.countdownSync,
    (event) => {
      rt.activeCountdowns.current = event.payload.items
      rt.logDebug("Received broadcast:countdown-sync", {
        count: event.payload.items.length,
      })
      ensureCountdownLoop()
    }
  )

  const unlistenCountdownDismiss = listenOutputEvent(
    BROADCAST_EVENTS.countdownDismiss,
    (event) => {
      rt.activeCountdowns.current = rt.activeCountdowns.current.filter(
        (c) => c.countdown.id !== event.payload.countdownId
      )
      rt.logDebug("Received broadcast:countdown-dismiss", {
        countdownId: event.payload.countdownId,
      })
      rt.draw()
      rt.pushNdiBurst()
    }
  )

  const unlistenCountdownDismissAll = listenOutputEvent(
    BROADCAST_EVENTS.countdownDismissAll,
    () => {
      rt.activeCountdowns.current = []
      rt.logDebug("Received broadcast:countdown-dismiss-all")
      rt.draw()
      rt.pushNdiBurst()
    }
  )

  const unlistenProps = listenOutputEvent(
    BROADCAST_EVENTS.propsUpdate,
    (event) => {
      rt.activeProps.current = event.payload.props
      rt.logDebug("Received broadcast:props-update", {
        count: event.payload.props.length,
      })
      for (const prop of event.payload.props) {
        if (prop.type === "image") {
          preloadImage(
            rt.imageCacheRef.current,
            prop.imageUrl,
            () => {
              rt.draw()
              rt.pushNdiBurst()
            },
            "prop image"
          )
        }
      }
      rt.draw()
      rt.pushNdiBurst()

      // A marquee scrolls every frame, so run a "marquee" render-loop reason
      // while any active prop is a marquee (mirrors the countdown ticker); its
      // keepAlive self-stops (before the frame) once none remain.
      if (rt.activeProps.current.some((p) => p.type === "marquee")) {
        renderLoop.activate("marquee", {
          keepAlive: () =>
            rt.activeProps.current.some((p) => p.type === "marquee"),
        })
      } else {
        renderLoop.deactivate("marquee")
      }
    }
  )

  // The media layer is a backdrop composited *behind* slide content, so slides
  // animating over it redraw constantly. The old path cleared the outgoing
  // backdrop (nulled its image/paused its video) the instant an update arrived,
  // while the incoming asset was still decoding — any redraw in that gap fell
  // through to the black floor (worse on production, where assets stream over the
  // asset protocol). Instead, hold the outgoing backdrop until the incoming asset
  // can paint, then swap atomically. `seq` fences stale async loads (a newer
  // update wins); `applied` makes each update's swap idempotent across the
  // onload/onerror/fallback races.
  let mediaLayerSeq = 0
  const unlistenMediaLayer = listenOutputEvent(
    BROADCAST_EVENTS.mediaLayerUpdate,
    (event) => {
      const { layer } = event.payload
      const seq = ++mediaLayerSeq
      let applied = false
      rt.logDebug("Received broadcast:media-layer-update", {
        layer: layer?.name ?? null,
      })

      // Clearing the layer is instant: drop the backdrop and stop its video.
      if (!layer) {
        renderLoop.deactivate("mediaLayer")
        if (rt.mediaLayerVideoRef.current) {
          rt.mediaLayerVideoRef.current.pause()
          rt.mediaLayerVideoRef.current.src = ""
        }
        rt.mediaLayerVideoRef.current = null
        rt.mediaLayerImgRef.current = null
        rt.mediaLayerRef.current = null
        rt.draw()
        rt.pushNdiBurst()
        return
      }

      const src = safeFileSrc(layer.filePath)

      // Retire the outgoing background video (if any) as we commit the new layer.
      const retireOldVideo = (keep?: HTMLVideoElement) => {
        const prev = rt.mediaLayerVideoRef.current
        if (prev && prev !== keep) {
          prev.pause()
          prev.src = ""
        }
      }

      const swapImage = (img: HTMLImageElement) => {
        if (applied || seq !== mediaLayerSeq) return
        applied = true
        renderLoop.deactivate("mediaLayer")
        retireOldVideo()
        rt.mediaLayerVideoRef.current = null
        rt.mediaLayerImgRef.current = img
        rt.mediaLayerRef.current = layer
        rt.draw()
        rt.pushNdiBurst()
      }

      const swapVideo = (video: HTMLVideoElement) => {
        if (applied || seq !== mediaLayerSeq) return
        applied = true
        retireOldVideo(video)
        rt.mediaLayerImgRef.current = null
        rt.mediaLayerVideoRef.current = video
        rt.mediaLayerRef.current = layer
        void video.play()
        rt.startMediaLayerVideoLoop()
        rt.draw()
        rt.pushNdiBurst()
      }

      // The asset failed or is too slow — reflect the requested layer anyway
      // (state must not stay stuck on the previous backdrop) and let the
      // compositor draw the black floor beneath it.
      const commitBlank = () => {
        if (applied || seq !== mediaLayerSeq) return
        applied = true
        renderLoop.deactivate("mediaLayer")
        retireOldVideo()
        rt.mediaLayerVideoRef.current = null
        rt.mediaLayerImgRef.current = null
        rt.mediaLayerRef.current = layer
        rt.draw()
        rt.pushNdiBurst()
      }

      if (layer.mediaType === "image") {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => swapImage(img)
        img.onerror = () => {
          console.warn("[broadcast-output] failed to load media layer image", {
            src,
          })
          commitBlank()
        }
        img.src = src
      } else {
        const video = document.createElement("video")
        video.crossOrigin = "anonymous"
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.src = src
        video.onloadeddata = () => swapVideo(video)
        video.onerror = () => {
          console.warn("[broadcast-output] failed to load media layer video", {
            src,
          })
          commitBlank()
        }
        video.load()
      }

      // Never hold the outgoing backdrop indefinitely on a stalled asset.
      setTimeout(commitBlank, ASSET_REVEAL_FALLBACK_MS)
    }
  )

  return disposeSubscriptions([
    unlistenAlert,
    unlistenAlertDismiss,
    unlistenAlertDismissAll,
    unlistenCountdown,
    unlistenCountdownUpdate,
    unlistenCountdownSync,
    unlistenCountdownDismiss,
    unlistenCountdownDismissAll,
    unlistenProps,
    unlistenMediaLayer,
  ])
}
