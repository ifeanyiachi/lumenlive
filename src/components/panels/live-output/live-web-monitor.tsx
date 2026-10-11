import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import { useBroadcastStore } from "@/stores"
import type { LiveWeb } from "@/stores/broadcast-store"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { GlobeIcon, PauseIcon, PlayIcon } from "lucide-react"

/**
 * Audience monitor for a live YouTube item. Cueing (seeks, markers, and video
 * edits) is done in Program preview; this display retains play/pause only.
 */
export function LiveWebMonitor({
  web,
  src,
  onAir,
}: {
  web: LiveWeb
  src: string
  onAir: boolean
}) {
  const { t } = useTranslation("panels")
  const sendWeb = useBroadcastStore((s) => s.sendWebTransport)
  const isYouTube = web.isYouTube && !!web.videoId
  const containerId = useMemo(
    () => `yt-live-${web.videoId ?? "web"}`,
    [web.videoId]
  )
  const { state, loadVideo, play, pause, seekTo, toggleMute } =
    useYouTubePlayer(containerId)
  const webTransport = useBroadcastStore((s) => s.webTransport)
  const startRequestedRef = useRef<string | null>(null)

  useEffect(() => {
    if (isYouTube) void loadVideo(web.videoId!, false)
  }, [isYouTube, web.videoId, loadVideo])
  useEffect(() => {
    if (state.isReady && (web.startTime ?? 0) > 0) seekTo(web.startTime!)
  }, [state.isReady, web.startTime, seekTo])
  useEffect(() => {
    if (state.isReady && !state.isMuted) toggleMute()
  }, [state.isReady, state.isMuted, toggleMute])

  // One start request drives every output. The output window queues this
  // request if its YouTube iframe is still loading, so a slow external monitor
  // cannot miss the play command.
  useEffect(() => {
    if (!isYouTube || !onAir || !state.isReady) {
      if (!onAir) startRequestedRef.current = null
      return
    }
    if (startRequestedRef.current === web.videoId) return
    startRequestedRef.current = web.videoId!
    // Resume the operator mirror immediately as well as the audience player.
    // The output window may still be rebuilding its iframe after an off→on
    // transition, so waiting for its first progress echo can leave this panel
    // stuck behind a stale `playing: false` update.
    seekTo(web.startTime ?? 0)
    play()
    sendWeb("seek", { position: web.startTime ?? 0 })
    sendWeb("play")
  }, [
    isYouTube,
    onAir,
    state.isReady,
    web.videoId,
    web.startTime,
    play,
    seekTo,
    sendWeb,
  ])

  // Start this operator mirror only after the external output confirms that it
  // is playing, then keep it aligned to the echoed output position.
  useEffect(() => {
    if (!isYouTube || !onAir || !state.isReady || !webTransport) return
    if (webTransport.playing) {
      // The first playing echo acknowledges the explicit resume request above.
      // From this point onward the output is authoritative for drift correction.
      startRequestedRef.current = null
      if (Math.abs(state.currentTime - webTransport.position) > 0.1) {
        seekTo(webTransport.position)
      }
      if (!state.isPlaying) play()
    } else {
      // Do not let the stale paused echo generated while the output iframe is
      // being recreated undo the off→on resume request.
      if (startRequestedRef.current === web.videoId) return
      pause()
    }
  }, [
    isYouTube,
    onAir,
    state.isReady,
    state.isPlaying,
    state.currentTime,
    webTransport,
    web.videoId,
    pause,
    play,
    seekTo,
  ])
  useEffect(() => {
    if (!onAir) {
      pause()
      sendWeb("pause")
    }
  }, [onAir, pause, sendWeb])

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      startRequestedRef.current = null
      pause()
      sendWeb("pause")
    } else {
      startRequestedRef.current = web.videoId ?? null
      play()
      sendWeb("play")
    }
  }, [state.isPlaying, web.videoId, pause, play, sendWeb])

  if (!isYouTube)
    return (
      <iframe
        src={src}
        title={t("liveWeb.outputTitle")}
        allow="autoplay; encrypted-media"
        className="size-full border-none"
        style={{ pointerEvents: "none" }}
      />
    )

  return (
    <div className="relative size-full">
      <div className="pointer-events-none size-full">
        <div id={containerId} className="size-full" />
      </div>
      {!state.isReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
          <span className="text-[0.625rem] text-white/60">
            {t("liveWeb.loadingPlayer")}
          </span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
        <GlobeIcon className="size-2.5 text-white/70" />
        <span className="text-[0.5rem] text-white/70">
          {t("liveWeb.youtube")}
        </span>
      </div>
      <button
        type="button"
        onClick={togglePlay}
        disabled={!state.isReady}
        className="absolute right-3 bottom-3 z-20 flex size-7 items-center justify-center rounded-full bg-white/90 text-black transition-colors hover:bg-white disabled:opacity-50"
        title={state.isPlaying ? t("liveWeb.pause") : t("liveWeb.play")}
      >
        {state.isPlaying ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </button>
    </div>
  )
}
