// LumenLive web overlay — a controllable YouTube page that sits over the broadcast
// output window. Unlike a raw `youtube.com/embed` navigation, this page hosts
// the YouTube IFrame Player API so the control window can drive play/pause/seek/
// mute and receive live position echoes (Phase 0 of ytex.md).

import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

/* eslint-disable @typescript-eslint/no-explicit-any */

interface WebTransportPayload {
  action: "play" | "pause" | "seek" | "mute" | "jumpLive"
  position?: number
  muted?: boolean
}

const PLAYER_ID = "yt-player"

// ── Hash config: #output=main&videoId=abc&start=12&end=340&live=1&muted=1 ──
const params = new URLSearchParams(window.location.hash.slice(1))
const VIDEO_ID = params.get("videoId") ?? ""
const START = Number(params.get("start")) || 0
const END = Number(params.get("end")) || 0
const IS_LIVE = params.get("live") === "1"
const START_MUTED = params.get("muted") === "1"

const currentWindow = getCurrentWebviewWindow()

// ── Load the YouTube IFrame API once, resolve when ready ──
function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if ((window as any).YT?.Player) {
      resolve()
      return
    }
    ;(window as any).onYouTubeIframeAPIReady = () => resolve()
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
  })
}

let player: any = null
let endHandled = false

function emitProgress(): void {
  if (!player || typeof player.getCurrentTime !== "function") return
  try {
    const duration = Number(player.getDuration()) || 0
    const state = player.getPlayerState() // 1 = playing
    void currentWindow
      .emitTo("main", "broadcast:web-progress", {
        position: Number(player.getCurrentTime()) || 0,
        duration,
        playing: state === 1,
        isLive: IS_LIVE,
        liveEdge: IS_LIVE ? duration : 0,
      })
      .catch(() => {})
  } catch {
    // player may be mid-navigation
  }
}

async function main() {
  if (!VIDEO_ID) return
  await loadYouTubeApi()

  player = new (window as any).YT.Player(PLAYER_ID, {
    videoId: VIDEO_ID,
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 1,
      controls: 0,
      rel: 0,
      modestbranding: 1,
      fs: 0,
      enablejsapi: 1,
      playsinline: 1,
      origin: window.location.origin,
      mute: START_MUTED ? 1 : 0,
      start: START > 0 ? Math.floor(START) : undefined,
    },
    events: {
      onReady: () => {
        if (START_MUTED) player.mute()
        if (START > 0) {
          // `start` playerVar covers VOD; seekTo also handles live DVR windows.
          try {
            player.seekTo(START, true)
          } catch {
            /* DVR may be disabled */
          }
        }
        player.playVideo()
        emitProgress()
      },
      onStateChange: () => {
        emitProgress()
      },
    },
  })

  // Position echo + VOD end enforcement.
  setInterval(() => {
    emitProgress()
    if (!IS_LIVE && END > 0 && !endHandled && player?.getCurrentTime) {
      try {
        if (player.getCurrentTime() >= END) {
          endHandled = true
          player.pauseVideo()
        }
      } catch {
        /* ignore */
      }
    }
  }, 250)
}

// ── Control channel: control window → overlay ──
void listen<WebTransportPayload>("broadcast:web-transport", (event) => {
  if (!player) return
  const { action, position, muted } = event.payload
  try {
    switch (action) {
      case "play":
        endHandled = false
        player.playVideo()
        break
      case "pause":
        player.pauseVideo()
        break
      case "seek":
        if (position != null) {
          endHandled = false
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
    /* player may be mid-navigation */
  }
  emitProgress()
})

void main()
