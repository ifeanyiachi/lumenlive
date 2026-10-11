import { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import type { LiveWeb } from "@/stores/broadcast-store"
import { useBroadcastStore } from "@/stores"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { GlobeIcon, PauseIcon, PlayIcon, RadioIcon } from "lucide-react"
import {
  sortMarkers,
  findMarkerInDirection,
  relativeSeekTarget,
} from "@/lib/live-output/markers"
import { formatClock, isAtLiveEdge } from "@/lib/live-output/transport"
import { useTranslation } from "react-i18next"

/**
 * Off-air YouTube monitor. Its transport edits the staged cue only; Go Live
 * later commits that cue to the audience output. Its player remains muted unless
 * the operator enables preview monitoring, so cue playback never reaches air.
 */
export function PreviewWebMonitor({
  web,
  monitorAudio,
}: {
  web: LiveWeb
  monitorAudio: boolean
}) {
  const { t } = useTranslation("panels")
  const updatePreviewWeb = useBroadcastStore((s) => s.updatePreviewWeb)
  const isYouTube = web.isYouTube && !!web.videoId
  const containerId = useMemo(
    () => `yt-preview-${web.videoId ?? "web"}`,
    [web.videoId]
  )
  const { state, loadVideo, pause, play, seekTo, toggleMute, togglePlay } =
    useYouTubePlayer(containerId)
  const { currentTime, duration, isReady, isMuted } = state
  const [dragCurrent, setDragCurrent] = useState<number | null>(null)
  const position = dragCurrent ?? currentTime
  const isLive = web.isLive ?? false
  const isLiveWeb = useBroadcastStore(
    (s) => s.isLive && s.liveWeb?.videoId === web.videoId
  )
  const webTransport = useBroadcastStore((s) => s.webTransport)
  const markers = useMemo(() => sortMarkers(web.markers ?? []), [web.markers])

  useEffect(() => {
    if (isYouTube) void loadVideo(web.videoId!, false)
  }, [isYouTube, web.videoId, loadVideo])

  // Apply a staged offset once the player is ready. This also makes a newly
  // presented edited cue visibly match what Go Live will show.
  useEffect(() => {
    if (isReady && (web.startTime ?? 0) > 0) seekTo(web.startTime!)
  }, [isReady, web.startTime, seekTo])

  // Go Live hands playback to the output window. Stop the off-air preview as
  // soon as it becomes live, then follow the output's confirmed play state and
  // position so the three visible surfaces share one clock.
  useEffect(() => {
    if (!isYouTube || !isReady || !isLiveWeb) return
    if (webTransport?.playing) {
      if (Math.abs(currentTime - webTransport.position) > 0.1) {
        seekTo(webTransport.position)
      }
      if (!state.isPlaying) play()
    } else {
      pause()
    }
  }, [
    isYouTube,
    isReady,
    isLiveWeb,
    webTransport,
    currentTime,
    state.isPlaying,
    pause,
    play,
    seekTo,
  ])

  useEffect(() => {
    if (!isReady || isMuted === !monitorAudio) return
    toggleMute()
  }, [isReady, isMuted, monitorAudio, toggleMute])

  const commitSeek = useCallback(
    (time: number) => {
      seekTo(time)
      setDragCurrent(null)
      // The start offset is the portable cue configuration used by the output's
      // YouTube layer, so it is the right representation of a preview seek.
      updatePreviewWeb({ startTime: time })
    },
    [seekTo, updatePreviewWeb]
  )

  const jumpRelative = useCallback(
    (direction: 1 | -1) => {
      const marker = findMarkerInDirection(markers, position, direction)
      commitSeek(marker?.time ?? relativeSeekTarget(position, direction))
    },
    [markers, position, commitSeek]
  )

  if (!isYouTube) {
    return (
      <iframe
        src={web.url}
        title={t("webPreview.frameTitle")}
        allow="autoplay; encrypted-media"
        className="size-full border-none"
      />
    )
  }

  const atLiveEdge = isAtLiveEdge(isLive, duration, position)
  return (
    <div className="relative size-full">
      <div className="pointer-events-none size-full">
        <div id={containerId} className="size-full" />
      </div>
      {!isReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
          <span className="text-[0.625rem] text-white/60">
            {t("webPreview.loading")}
          </span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
        <GlobeIcon className="size-2.5 text-white/70" />
        <span className="text-[0.5rem] text-white/70">
          {t("webPreview.youtube")}
        </span>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2">
        {(markers.length > 0 || isLive) && (
          <div className="flex flex-wrap items-center gap-1">
            {markers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                onClick={() => commitSeek(marker.time)}
                className="rounded bg-white/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-white transition-colors hover:bg-white/25"
                title={t("webPreview.cueForLive", {
                  time: formatClock(marker.time),
                })}
              >
                {marker.label}
              </button>
            ))}
            {isLive && (
              <button
                type="button"
                onClick={() => commitSeek(duration)}
                disabled={atLiveEdge || duration <= 0}
                className={cn(
                  "ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase",
                  atLiveEdge
                    ? "bg-red-500/25 text-red-300"
                    : "bg-red-500/80 text-white hover:bg-red-500"
                )}
                title={t("webPreview.cueLiveEdge")}
              >
                <RadioIcon className="size-2.5" />
                {atLiveEdge ? t("webPreview.live") : t("webPreview.cueLive")}
              </button>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!isReady}
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-colors hover:bg-white disabled:opacity-50"
            title={
              state.isPlaying ? t("webPreview.pause") : t("webPreview.play")
            }
          >
            {state.isPlaying ? (
              <PauseIcon className="size-3" />
            ) : (
              <PlayIcon className="size-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => jumpRelative(-1)}
            disabled={!isReady}
            className="text-[0.625rem] text-white/80 hover:text-white disabled:opacity-40"
            title={t("webPreview.previous")}
          >
            −
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(position, duration || 0)}
            disabled={!isReady || duration <= 0}
            onChange={(event) => {
              const time = Number(event.target.value)
              setDragCurrent(time)
              seekTo(time)
            }}
            onPointerUp={(event) =>
              commitSeek(Number((event.target as HTMLInputElement).value))
            }
            onKeyUp={(event) =>
              commitSeek(Number((event.target as HTMLInputElement).value))
            }
            className="h-1 flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => jumpRelative(1)}
            disabled={!isReady}
            className="text-[0.625rem] text-white/80 hover:text-white disabled:opacity-40"
            title={t("webPreview.next")}
          >
            +
          </button>
          <span className="shrink-0 text-[0.625rem] text-white/80 tabular-nums">
            {formatClock(position)} /{" "}
            {isLive ? t("webPreview.live") : formatClock(duration)}
          </span>
        </div>
      </div>
    </div>
  )
}
