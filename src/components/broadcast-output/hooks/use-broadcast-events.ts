/**
 * The output window's listener lifecycle, in one place.
 *
 * This replaces the old ~800-line `useEffect` in `broadcast-output.tsx`. It:
 *   1. sizes the canvas and paints the initial black frame,
 *   2. creates the single coalesced render loop and publishes it to the runtime,
 *   3. registers every subsystem's listeners via its `events/*.ts` registrar,
 *   4. returns one cleanup that disposes every registrar and tears down the loop,
 *      RAFs, and media elements.
 *
 * The registrars are ordered so the surface/lifecycle group is LAST — its
 * `output-ready` handshake must fire only after every content listener is live, or
 * the main window's replayed state could arrive before a listener exists. The
 * combined teardown keeps the (previously hand-maintained) cleanup list exhaustive
 * and in one spot.
 */

import { useEffect } from "react"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { createRenderLoop } from "@/lib/broadcast-output/render-loop"
import type { OutputRuntime } from "../runtime"
import type { MediaPlayback } from "./use-media-playback"
import { registerVerseListener } from "../events/verse-listener"
import { registerSlideListener } from "../events/slide-listener"
import { registerMediaListeners } from "../events/media-listeners"
import { registerOverlayListeners } from "../events/overlay-listeners"
import { registerVisibilityListeners } from "../events/visibility-listeners"
import { registerSurfaceListeners } from "../events/surface-listeners"

export function useBroadcastEvents(rt: OutputRuntime, media: MediaPlayback) {
  // Pulled out of `rt` so the canvas mutation + loop publish read as bare refs to
  // the linter (mutating through a hook-returned object trips react-hooks rules).
  const { canvasRef, renderLoopRef } = rt

  useEffect(() => {
    // Set initial canvas size
    const canvas = canvasRef.current
    if (canvas) {
      canvas.width = 1920
      canvas.height = 1080
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, 1920, 1080)
      }
    }

    // Create the single render loop for this listener lifetime and publish it to
    // the ref the render-scope loop starters read. The frame callback reads
    // `draw`/`push` through refs (kept current after commit), so a fresh `draw`
    // identity doesn't need a new loop.
    const renderLoop = createRenderLoop({
      onFrame: (shouldPush) => {
        rt.drawRef.current()
        if (shouldPush) void rt.pushNdiFrameRef.current()
      },
      // Cap continuous animated-content redraws to ~30fps. A full 1080p
      // recomposite per RAF (60Hz) — with DirectComposition disabled so the
      // canvas is software-composited across the shared WebView2 environment —
      // starved the operator window, freezing its transport/scrubber whenever an
      // output window was open on animated content. 30fps is imperceptible on a
      // projector and halves the load. Content-change draws (direct `draw()` /
      // `pushNdiBurst`) and slide transitions bypass this — only the steady-state
      // animation loop is throttled.
      minFrameIntervalMs: 1000 / 30,
    })
    renderLoopRef.current = renderLoop

    const currentWindow = getCurrentWebviewWindow()
    rt.logDebug("Listener registration started", { label: currentWindow.label })

    // Register every subsystem. Surface/lifecycle is last so `output-ready` only
    // fires once the content listeners above are all live.
    const disposers = [
      registerVerseListener(rt, renderLoop),
      registerSlideListener(rt, renderLoop),
      registerMediaListeners(rt, renderLoop, media),
      registerOverlayListeners(rt, renderLoop),
      registerVisibilityListeners(rt, renderLoop),
      registerSurfaceListeners(rt),
    ]

    return () => {
      for (const dispose of disposers) dispose()
      // Tears down every coalesced animation reason (slide/media-layer video,
      // slide-anim, marquee, countdown, theme-anim, base-video) in one call.
      renderLoop.stop()
      renderLoopRef.current = null
      // Cleanup must cancel/tear down the ref's latest value at unmount, not a
      // snapshot copied at effect setup.
      cancelAnimationFrame(rt.stageClockRafRef.current)
      cancelAnimationFrame(rt.videoRafRef.current)
      if (rt.transitionRef.current)
        cancelAnimationFrame(rt.transitionRef.current.rafId)
      for (const [, v] of rt.videoCacheRef.current) {
        v.pause()
        v.src = ""
      }
      if (rt.videoRef.current) {
        rt.videoRef.current.pause()
        rt.videoRef.current.src = ""
      }
      if (rt.audioRef.current) {
        rt.audioRef.current.pause()
        rt.audioRef.current.src = ""
      }
      if (rt.mediaLayerVideoRef.current) {
        rt.mediaLayerVideoRef.current.pause()
        rt.mediaLayerVideoRef.current.src = ""
      }
    }
    // `rt` and the destructured refs are stable across renders, so this registers
    // exactly once — matching the original single-run effect.
  }, [rt, media, canvasRef, renderLoopRef])
}
