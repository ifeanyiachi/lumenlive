// Embedded YouTube layer for a broadcast output window.
//
// YouTube can't be composited onto the output canvas (it's a sandboxed iframe),
// so it renders as a DOM layer over the canvas *inside the output window* — no
// separate always-on-top overlay window (which showed up as a stray "popout"
// when the output shared the operator's screen). This hosts the YouTube IFrame
// Player API so the control window can drive play/pause/seek/mute and receive
// live position echoes, exactly as the old web-overlay window did — the config
// now arrives over `broadcast:web-content` instead of the window URL hash.
//
// React owns only the stable host <div>; the player element is created/destroyed
// imperatively inside it so React reconciliation never collides with the DOM the
// YouTube API mutates.

import { useCallback, useEffect, useRef, useState } from "react"
import type { WebContentPayload } from "@/types/broadcast"
import {
  listenOutputEvent,
  BROADCAST_EVENTS,
  emitWebProgress,
} from "@/services/broadcast-content-gateway"

/* eslint-disable @typescript-eslint/no-explicit-any */

// Load the YouTube IFrame API once per window, resolving when it's ready. The
// output window has a single consumer (this component), so the global
// `onYouTubeIframeAPIReady` hook is safe to own here.
function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).YT?.Player) {
      resolve()
      return
    }
    const alreadyLoading = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    )
    if (alreadyLoading) {
      // The script is mid-load from an earlier mount; poll until YT is ready
      // rather than clobbering the pending `onYouTubeIframeAPIReady`.
      const timer = setInterval(() => {
        if ((window as any).YT?.Player) {
          clearInterval(timer)
          resolve()
        }
      }, 50)
      return
    }
    ;(window as any).onYouTubeIframeAPIReady = () => resolve()
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
  })
}

export function OutputWebLayer() {
  const [content, setContent] = useState<WebContentPayload | null>(null)
  const playerRef = useRef<any>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const endHandledRef = useRef(false)
  // Latest content for handlers that fire outside the mount effect (transport,
  // progress echo) without re-binding their listeners each present. Written in
  // an effect (not during render) — the handlers read it later, after commit.
  const contentRef = useRef<WebContentPayload | null>(null)
  useEffect(() => {
    contentRef.current = content
  })

  const emitProgress = useCallback(() => {
    const player = playerRef.current
    const cfg = contentRef.current
    if (!player || !cfg || typeof player.getCurrentTime !== "function") return
    try {
      const duration = Number(player.getDuration()) || 0
      const state = player.getPlayerState() // 1 = playing
      emitWebProgress({
        position: Number(player.getCurrentTime()) || 0,
        duration,
        playing: state === 1,
        isLive: cfg.isLive,
        liveEdge: cfg.isLive ? duration : 0,
      })
    } catch {
      // player may be mid-navigation
    }
  }, [])

  // Content channel: the control window tells us which video to host (or `null`
  // to tear down).
  useEffect(() => {
    const unlisten = listenOutputEvent(BROADCAST_EVENTS.webContent, (event) =>
      setContent(event.payload)
    )
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  // Transport channel: play/pause/seek/jumpLive/mute from the control window.
  useEffect(() => {
    const unlisten = listenOutputEvent(
      BROADCAST_EVENTS.webTransport,
      (event) => {
        const player = playerRef.current
        if (!player) return
        const { action, position, muted } = event.payload
        try {
          switch (action) {
            case "play":
              endHandledRef.current = false
              player.playVideo()
              break
            case "pause":
              player.pauseVideo()
              break
            case "seek":
              if (position != null) {
                endHandledRef.current = false
                player.seekTo(position, true)
              }
              break
            case "jumpLive":
              if (typeof player.getDuration === "function") {
                player.seekTo(player.getDuration(), true)
                player.playVideo()
              }
              break
            case "mute":
              if (muted) player.mute()
              else player.unMute()
              break
          }
        } catch {
          // player may be mid-navigation
        }
        emitProgress()
      }
    )
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [emitProgress])

  // Audience mute rides the shared `broadcast:mute` event (same one that mutes
  // canvas media), so the embedded player follows the live mute toggle.
  useEffect(() => {
    const unlisten = listenOutputEvent(BROADCAST_EVENTS.mute, (event) => {
      const player = playerRef.current
      if (!player) return
      try {
        if (event.payload.muted) player.mute()
        else player.unMute()
      } catch {
        // player may be mid-navigation
      }
    })
    return () => {
      void unlisten.then((fn) => fn())
    }
  }, [])

  // Mount / replace / tear down the player whenever the presented content
  // changes. `content` is a fresh object each present (nonce-bumped upstream),
  // so this re-runs and replays from the top on every re-present.
  useEffect(() => {
    const cfg = content
    if (!cfg || !cfg.videoId) return
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    endHandledRef.current = false
    // Hand the YouTube API a fresh element it fully owns; React never touches it.
    host.replaceChildren()
    const target = document.createElement("div")
    target.style.width = "100%"
    target.style.height = "100%"
    host.appendChild(target)

    void loadYouTubeApi().then(() => {
      if (cancelled) return
      playerRef.current = new (window as any).YT.Player(target, {
        videoId: cfg.videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: cfg.autoplay ? 1 : 0,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          fs: 0,
          enablejsapi: 1,
          playsinline: 1,
          origin: window.location.origin,
          mute: cfg.muted ? 1 : 0,
          start: cfg.start > 0 ? Math.floor(cfg.start) : undefined,
        },
        events: {
          onReady: () => {
            const player = playerRef.current
            if (!player) return
            if (cfg.muted) player.mute()
            if (cfg.start > 0) {
              // `start` playerVar covers VOD; seekTo also handles live DVR.
              try {
                player.seekTo(cfg.start, true)
              } catch {
                /* DVR may be disabled */
              }
            }
            // Only auto-start when opted in; otherwise stay cued so YouTube never
            // blares the moment it hits the audience output.
            if (cfg.autoplay) player.playVideo()
            emitProgress()
          },
          onStateChange: () => emitProgress(),
        },
      })
    })

    // Position echo + VOD out-point enforcement.
    const interval = setInterval(() => {
      emitProgress()
      const player = playerRef.current
      if (cfg.isLive || cfg.end <= 0 || endHandledRef.current) return
      if (player?.getCurrentTime) {
        try {
          if (player.getCurrentTime() >= cfg.end) {
            endHandledRef.current = true
            player.pauseVideo()
          }
        } catch {
          /* ignore */
        }
      }
    }, 250)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy()
        } catch {
          /* already gone */
        }
      }
      playerRef.current = null
    }
  }, [content, emitProgress])

  if (!content || !content.videoId) return null
  return (
    <div
      ref={hostRef}
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 1,
      }}
    />
  )
}
