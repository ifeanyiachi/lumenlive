/**
 * Overlay listeners: alerts (×3), countdowns (×5), props/marquee, and the media
 * layer. Alerts/countdowns/props mutate their active sets and repaint; countdown
 * and marquee spin up their per-frame render-loop reasons while any remain. Moved
 * verbatim from the output-window effect.
 */

import { preloadImage } from "@/lib/broadcast-output/asset-cache"
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

  const unlistenMediaLayer = listenOutputEvent(
    BROADCAST_EVENTS.mediaLayerUpdate,
    (event) => {
      const { layer } = event.payload
      rt.logDebug("Received broadcast:media-layer-update", {
        layer: layer?.name ?? null,
      })

      renderLoop.deactivate("mediaLayer")
      if (rt.mediaLayerVideoRef.current) {
        rt.mediaLayerVideoRef.current.pause()
        rt.mediaLayerVideoRef.current.src = ""
      }
      rt.mediaLayerImgRef.current = null
      rt.mediaLayerRef.current = layer

      if (!layer) {
        rt.draw()
        rt.pushNdiBurst()
        return
      }

      const src = safeFileSrc(layer.filePath)

      if (layer.mediaType === "image") {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          rt.mediaLayerImgRef.current = img
          rt.draw()
          rt.pushNdiBurst()
        }
        img.src = src
      } else {
        const video = document.createElement("video")
        video.crossOrigin = "anonymous"
        video.muted = true
        video.loop = true
        video.playsInline = true
        video.src = src
        video.onloadeddata = () => {
          rt.mediaLayerVideoRef.current = video
          void video.play()
          rt.startMediaLayerVideoLoop()
        }
        video.load()
      }
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
