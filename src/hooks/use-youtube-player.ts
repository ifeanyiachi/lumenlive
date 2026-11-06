import { useEffect, useRef, useCallback, useState } from "react"

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: (() => void) | undefined
  }
}

// A namespace is the idiomatic way to declare an ambient third-party global
// (the YouTube IFrame API) that merges types and values (YT.Player, YT.PlayerState).
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace YT {
  const PlayerState: {
    UNSTARTED: -1
    ENDED: 0
    PLAYING: 1
    PAUSED: 2
    BUFFERING: 3
    CUED: 5
  }

  class Player {
    constructor(
      elementId: string | HTMLElement,
      options: {
        videoId?: string
        width?: number | string
        height?: number | string
        playerVars?: Record<string, string | number>
        events?: {
          onReady?: (event: { target: Player }) => void
          onStateChange?: (event: { data: number; target: Player }) => void
          onError?: (event: { data: number }) => void
        }
      }
    )
    playVideo(): void
    pauseVideo(): void
    seekTo(seconds: number, allowSeekAhead?: boolean): void
    setVolume(volume: number): void
    getVolume(): number
    mute(): void
    unMute(): void
    isMuted(): boolean
    getCurrentTime(): number
    getDuration(): number
    getPlayerState(): number
    loadVideoById(videoId: string, startSeconds?: number): void
    cueVideoById(videoId: string, startSeconds?: number): void
    destroy(): void
    getVideoData(): { title: string; video_id: string }
  }
}

let apiLoaded = false
let apiLoading = false
const apiReadyCallbacks: (() => void)[] = []

function loadYouTubeApi(): Promise<void> {
  if (apiLoaded) return Promise.resolve()
  return new Promise((resolve) => {
    if (apiLoading) {
      apiReadyCallbacks.push(resolve)
      return
    }
    apiLoading = true
    apiReadyCallbacks.push(resolve)

    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true
      apiLoading = false
      prev?.()
      for (const cb of apiReadyCallbacks) cb()
      apiReadyCallbacks.length = 0
    }

    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(script)
  })
}

export interface YouTubePlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  isMuted: boolean
  videoTitle: string
  isReady: boolean
  isLoading: boolean
}

export function useYouTubePlayer(containerId: string) {
  const playerRef = useRef<YT.Player | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [state, setState] = useState<YouTubePlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 100,
    isMuted: false,
    videoTitle: "",
    isReady: false,
    isLoading: false,
  })

  const startPolling = useCallback(() => {
    if (intervalRef.current) return
    intervalRef.current = setInterval(() => {
      const p = playerRef.current
      if (!p) return
      try {
        setState((prev) => ({
          ...prev,
          currentTime: p.getCurrentTime(),
          duration: p.getDuration(),
          isPlaying: p.getPlayerState() === 1,
        }))
      } catch {
        // player may be destroyed
      }
    }, 250)
  }, [])

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const loadVideo = useCallback(
    async (videoId: string, autoplay = false) => {
      setState((prev) => ({ ...prev, isLoading: true }))
      await loadYouTubeApi()

      if (playerRef.current) {
        playerRef.current.destroy()
        playerRef.current = null
        stopPolling()
      }

      const el = document.getElementById(containerId)
      if (!el) return

      playerRef.current = new YT.Player(containerId, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          fs: 0,
          enablejsapi: 1,
          origin: window.location.origin,
          autoplay: autoplay ? 1 : 0,
          controls: 0,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            const p = e.target
            const data = p.getVideoData()
            setState((prev) => ({
              ...prev,
              isReady: true,
              isLoading: false,
              duration: p.getDuration(),
              volume: p.getVolume(),
              isMuted: p.isMuted(),
              videoTitle: data?.title ?? "",
            }))
            startPolling()
          },
          onStateChange: (e) => {
            const playing = e.data === 1
            setState((prev) => ({
              ...prev,
              isPlaying: playing,
            }))
          },
          onError: () => {
            setState((prev) => ({ ...prev, isLoading: false }))
          },
        },
      })
    },
    [containerId, startPolling, stopPolling]
  )

  const play = useCallback(() => playerRef.current?.playVideo(), [])
  const pause = useCallback(() => playerRef.current?.pauseVideo(), [])
  const togglePlay = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (p.getPlayerState() === 1) p.pauseVideo()
    else p.playVideo()
  }, [])
  const seekTo = useCallback(
    (seconds: number) => playerRef.current?.seekTo(seconds, true),
    []
  )
  const setVolume = useCallback((vol: number) => {
    playerRef.current?.setVolume(vol)
    setState((prev) => ({ ...prev, volume: vol }))
  }, [])
  const toggleMute = useCallback(() => {
    const p = playerRef.current
    if (!p) return
    if (p.isMuted()) {
      p.unMute()
      setState((prev) => ({ ...prev, isMuted: false }))
    } else {
      p.mute()
      setState((prev) => ({ ...prev, isMuted: true }))
    }
  }, [])

  useEffect(() => {
    return () => {
      stopPolling()
      playerRef.current?.destroy()
      playerRef.current = null
    }
  }, [stopPolling])

  return {
    state,
    loadVideo,
    play,
    pause,
    togglePlay,
    seekTo,
    setVolume,
    toggleMute,
  }
}
