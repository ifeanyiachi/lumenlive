/**
 * Media listeners: schedule-list media (image / audio / video), the fit update,
 * and the transport (play / pause / seek). The video state machine itself lives in
 * `useMediaPlayback`; these listeners cue elements and delegate playback to it.
 * Moved verbatim from the output-window effect.
 */

import { safeFileSrc } from "@/lib/media/safe-file-src"
import { toFitConfig } from "@/lib/broadcast-output/frame"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
  emitMediaEnded as sendMediaEnded,
} from "@/services/broadcast-content-gateway"
import type { RenderLoop } from "@/lib/broadcast-output/render-loop"
import type { OutputRuntime } from "../runtime"
import type { MediaPlayback } from "../hooks/use-media-playback"
import { disposeSubscriptions, type EventDisposer } from "./registrar"

export function registerMediaListeners(
  rt: OutputRuntime,
  renderLoop: RenderLoop,
  media: MediaPlayback
): EventDisposer {
  const { emitMediaProgress, runMediaVideoLoop, handleMediaVideoEnd } = media

  const unlistenMedia = listenOutputEvent(
    BROADCAST_EVENTS.mediaUpdate,
    (event) => {
      const { filePath, mediaType, name } = event.payload
      const src = safeFileSrc(filePath)
      rt.logDebug("Received broadcast:media-update", { name, mediaType })

      rt.latestData.current = null
      rt.latestSlide.current = null
      rt.latestMedia.current = null
      rt.layerFilterRef.current = event.payload.layerFilter ?? null
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
      rt.activeMode.current = "media"
      // Leaving verse mode: stop the verse theme's animated-background loop.
      renderLoop.deactivate("themeAnim")

      rt.mediaKindRef.current = mediaType
      rt.mediaFitRef.current = toFitConfig(event.payload)

      if (mediaType === "image") {
        const img = new Image()
        img.crossOrigin = "anonymous"
        img.onload = () => {
          rt.latestMedia.current = { img }
          rt.draw()
          rt.pushNdiBurst()
        }
        img.onerror = () =>
          console.warn("[broadcast-output] failed to load media image", {
            src,
          })
        img.src = src
      } else if (mediaType === "audio") {
        rt.mediaBlankRef.current = false
        if (!rt.audioRef.current) {
          rt.audioRef.current = document.createElement("audio")
        }
        const audio = rt.audioRef.current
        audio.muted = rt.broadcastMutedRef.current
        audio.loop = false
        rt.mediaConfigRef.current = {
          trimStart: event.payload.trimStart ?? 0,
          trimEnd: event.payload.trimEnd,
          loop: event.payload.loop ?? false,
          endAction: event.payload.endAction ?? "hold",
        }
        audio.src = src
        audio.onloadedmetadata = () => {
          const startAt = rt.mediaConfigRef.current?.trimStart ?? 0
          if (startAt > 0) {
            try {
              audio.currentTime = startAt
            } catch {
              /* not seekable yet */
            }
          }
        }
        audio.onloadeddata = () => {
          // Cue paused: playback starts only when the operator presses Play
          // (forwarded here as a "play" transport). Nothing auto-plays on air.
          emitMediaProgress(true)
        }
        audio.ontimeupdate = () => {
          const cfg = rt.mediaConfigRef.current
          if (cfg?.trimEnd != null && audio.currentTime >= cfg.trimEnd) {
            if (cfg.loop || cfg.endAction === "loop") {
              try {
                audio.currentTime = cfg.trimStart
              } catch {
                /* not seekable */
              }
            } else {
              audio.pause()
            }
          }
          emitMediaProgress()
        }
        audio.onended = () => {
          const cfg = rt.mediaConfigRef.current
          if (cfg?.loop || cfg?.endAction === "loop") {
            try {
              audio.currentTime = cfg.trimStart ?? 0
            } catch {
              /* not seekable */
            }
            void audio.play()
          } else if (cfg?.endAction === "next") {
            sendMediaEnded()
          }
          emitMediaProgress(true)
        }
        audio.load()
        rt.draw()
        rt.pushNdiBurst()
      } else {
        rt.mediaBlankRef.current = false
        if (!rt.videoRef.current) {
          rt.videoRef.current = document.createElement("video")
          rt.videoRef.current.crossOrigin = "anonymous"
          rt.videoRef.current.playsInline = true
        }
        const video = rt.videoRef.current
        video.muted = rt.broadcastMutedRef.current
        video.loop = false
        rt.mediaConfigRef.current = {
          trimStart: event.payload.trimStart ?? 0,
          trimEnd: event.payload.trimEnd,
          loop: event.payload.loop ?? false,
          endAction: event.payload.endAction ?? "hold",
        }
        video.src = src
        video.onloadedmetadata = () => {
          const startAt = rt.mediaConfigRef.current?.trimStart ?? 0
          if (startAt > 0) {
            try {
              video.currentTime = startAt
            } catch {
              /* not seekable yet */
            }
          }
        }
        video.onloadeddata = () => {
          // Cue paused on the first frame: draw it so the audience sees the
          // still, but don't start playback. The operator's Play (a "play"
          // transport) starts booth + audience together. Nothing auto-plays.
          rt.draw()
          rt.pushNdiBurst()
          emitMediaProgress(true)
        }
        video.onended = () => {
          handleMediaVideoEnd()
        }
        video.load()
      }
    }
  )

  const unlistenMediaFit = listenOutputEvent(
    BROADCAST_EVENTS.mediaFitUpdate,
    (event) => {
      if (rt.activeMode.current !== "media") return
      rt.mediaFitRef.current = toFitConfig(event.payload)
      rt.draw()
      rt.pushNdiBurst()
    }
  )

  const unlistenTransport = listenOutputEvent(
    BROADCAST_EVENTS.mediaTransport,
    (event) => {
      if (rt.activeMode.current !== "media") return
      const kind = rt.mediaKindRef.current
      if (kind !== "video" && kind !== "audio") return
      const isVideo = kind === "video"
      const el: HTMLMediaElement | null = isVideo
        ? rt.videoRef.current
        : rt.audioRef.current
      if (!el) return
      const { action, position } = event.payload

      if (action === "play") {
        rt.mediaBlankRef.current = false
        void el.play()
        if (isVideo) runMediaVideoLoop()
      } else if (action === "pause") {
        el.pause()
        if (isVideo) {
          cancelAnimationFrame(rt.videoRafRef.current)
          rt.draw()
          rt.pushNdiBurst()
        }
      } else if (action === "seek" && position != null) {
        rt.mediaBlankRef.current = false
        try {
          el.currentTime = position
        } catch {
          /* not seekable yet */
        }
        if (isVideo) {
          rt.draw()
          rt.pushNdiBurst()
          if (!el.paused) runMediaVideoLoop()
        }
      }
      emitMediaProgress(true)
    }
  )

  return disposeSubscriptions([
    unlistenMedia,
    unlistenMediaFit,
    unlistenTransport,
  ])
}
