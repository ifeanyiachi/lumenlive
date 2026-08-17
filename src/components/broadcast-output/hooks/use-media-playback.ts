/**
 * Media-playback state machine for the broadcast-output window.
 *
 * The live media video path (play / pause / seek / trim / loop / end-action) is a
 * small self-contained machine: a per-frame RAF loop that draws + pushes NDI while
 * a video plays, an end handler that decides loop/stop/hold/next, and a throttled
 * progress echo back to the operator. It only touches the shared `OutputRuntime`
 * refs and actions, so it lives here rather than inline in the giant listener
 * effect — moved verbatim from `broadcast-output.tsx`.
 *
 * `runMediaVideoLoop` and `handleMediaVideoEnd` are mutually recursive (loop → end
 * → loop on the loop branch), so they stay hoisted `function` declarations. The
 * throttle timestamp persists in a closure that is created once (the memo's deps
 * are `[rt]`, which is stable), matching the single effect-setup run it replaced.
 */

import { useMemo } from "react"
import {
  emitMediaProgress as sendMediaProgress,
  emitMediaEnded as sendMediaEnded,
} from "@/services/broadcast-content-gateway"
import type { OutputRuntime } from "../runtime"

export interface MediaPlayback {
  /** Echo the live media element's position back to the control window (throttled to 250ms unless forced). */
  emitMediaProgress: (force?: boolean) => void
  /** Start the per-frame draw/push loop that runs while a media video plays. */
  runMediaVideoLoop: () => void
  /** Resolve a video reaching its (trimmed) end: loop, stop, hold, or advance. */
  handleMediaVideoEnd: () => void
}

export function useMediaPlayback(rt: OutputRuntime): MediaPlayback {
  return useMemo(() => {
    // Only the primary output echoes playback position back to the control
    // window so the operator's scrubber can track the true output position.
    let lastProgressTs = 0
    const emitMediaProgress = (force = false) => {
      if (rt.outputId !== "main") return
      const kind = rt.mediaKindRef.current
      const el =
        kind === "video"
          ? rt.videoRef.current
          : kind === "audio"
            ? rt.audioRef.current
            : null
      if (!el) return
      const now = Date.now()
      if (!force && now - lastProgressTs < 250) return
      lastProgressTs = now
      sendMediaProgress({
        position: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        playing: !el.paused && !el.ended,
        ended: el.ended,
      })
    }

    // Mutually recursive, so declared as hoisted functions.
    function runMediaVideoLoop() {
      cancelAnimationFrame(rt.videoRafRef.current)
      const video = rt.videoRef.current
      if (!video) return
      // Cap the canvas redraw to ~30fps. Live media is ≤30fps at source and the
      // projector needs no more, so a full 1080p recomposite per RAF (60Hz) is
      // wasted work that — with DirectComposition disabled → software
      // compositing across the shared WebView2 environment — froze the operator
      // window's controls. RAF still fires ~60Hz (cheap end-of-clip checks); only
      // the expensive draw/push is throttled.
      const minInterval = 1000 / 30
      let lastDraw = Number.NEGATIVE_INFINITY
      const tick = () => {
        if (rt.activeMode.current !== "media") return
        const cfg = rt.mediaConfigRef.current
        if (cfg?.trimEnd != null && video.currentTime >= cfg.trimEnd) {
          handleMediaVideoEnd()
          return
        }
        if (video.paused || video.ended) return
        const t = performance.now()
        if (t - lastDraw >= minInterval - 2) {
          lastDraw = t
          rt.draw()
          void rt.pushNdiFrame()
          emitMediaProgress()
        }
        rt.videoRafRef.current = requestAnimationFrame(tick)
      }
      rt.videoRafRef.current = requestAnimationFrame(tick)
    }

    function handleMediaVideoEnd() {
      const video = rt.videoRef.current
      const cfg = rt.mediaConfigRef.current
      if (!video) return
      cancelAnimationFrame(rt.videoRafRef.current)
      const start = cfg?.trimStart ?? 0
      if (cfg?.loop || cfg?.endAction === "loop") {
        try {
          video.currentTime = start
        } catch {
          /* not seekable yet */
        }
        void video.play()
        runMediaVideoLoop()
        return
      }
      if (cfg?.endAction === "stop") {
        video.pause()
        rt.mediaBlankRef.current = true
        rt.draw()
        rt.pushNdiBurst()
        emitMediaProgress(true)
        return
      }
      // "hold" (default) and "next": freeze on the last visible frame
      video.pause()
      rt.draw()
      rt.pushNdiBurst()
      emitMediaProgress(true)
      if (cfg?.endAction === "next") {
        sendMediaEnded()
      }
    }

    return { emitMediaProgress, runMediaVideoLoop, handleMediaVideoEnd }
  }, [rt])
}
