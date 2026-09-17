import { useCallback, useEffect, useMemo } from "react"
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

  useEffect(() => {
    if (isYouTube) void loadVideo(web.videoId!, web.autoplay ?? false)
  }, [isYouTube, web.videoId, web.autoplay, loadVideo])
  useEffect(() => {
    if (state.isReady && (web.startTime ?? 0) > 0) seekTo(web.startTime!)
  }, [state.isReady, web.startTime, seekTo])
  useEffect(() => {
    if (state.isReady && !state.isMuted) toggleMute()
  }, [state.isReady, state.isMuted, toggleMute])
  useEffect(() => {
    if (!onAir) {
      pause()
      sendWeb("pause")
    }
  }, [onAir, pause, sendWeb])

  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause()
      sendWeb("pause")
    } else {
      play()
      sendWeb("play")
    }
  }, [state.isPlaying, pause, play, sendWeb])

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
          <span className="text-[0.625rem] text-white/60">{t("liveWeb.loadingPlayer")}</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
        <GlobeIcon className="size-2.5 text-white/70" />
        <span className="text-[0.5rem] text-white/70">{t("liveWeb.youtube")}</span>
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
