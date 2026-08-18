import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import { useBroadcastStore } from "@/stores"
import type { LiveWeb } from "@/stores/broadcast-store"
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { GlobeIcon, PlayIcon, PauseIcon, RadioIcon } from "lucide-react"
import {
  sortMarkers,
  findMarkerInDirection,
  relativeSeekTarget,
} from "@/lib/live-output/markers"
import { formatClock, isAtLiveEdge } from "@/lib/live-output/transport"

/**
 * Operator monitor + transport for a live YouTube item. Unlike before, the
 * monitor hosts its OWN controllable YouTube player (via {@link useYouTubePlayer})
 * so play / pause / scrub and the position readout work locally and immediately —
 * it no longer depends on a separate audience-overlay window echoing progress
 * back (which is why the controls used to appear dead on a single screen). Every
 * action is ALSO forwarded to the audience overlay(s) via `sendWebTransport` so
 * the broadcast output stays in lockstep. The audience never sees controls — its
 * player is built with `controls: 0` and this preview is pointer-events-none, so
 * all operation goes through the transport bar below. A live stream gets a
 * "Jump to Live" control; a VOD behaves like a recorded clip. Markers double as
 * DVR offsets when live. Non-YouTube web pages render as a plain display.
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
  const sendWeb = useBroadcastStore((s) => s.sendWebTransport)

  const isYouTube = web.isYouTube && !!web.videoId
  const containerId = useMemo(
    () => `yt-live-${web.videoId ?? "web"}`,
    [web.videoId]
  )
  const { state, loadVideo, play, pause, seekTo, toggleMute } =
    useYouTubePlayer(containerId)

  const isLive = web.isLive ?? false
  const startTime = web.startTime ?? 0
  const { isPlaying: playing, currentTime, duration, isReady, isMuted } = state

  const [dragCurrent, setDragCurrent] = useState<number | null>(null)
  const position = dragCurrent ?? currentTime

  // Latest position/duration for async probes (the DVR check) without capturing
  // a stale value in a setTimeout closure. Written in an effect (not during
  // render) — the probes read it later, after commit.
  const liveRef = useRef({ currentTime, duration })
  useEffect(() => {
    liveRef.current = { currentTime, duration }
  })

  // Set when a live seek-back was refused (no DVR) — the player snapped back to
  // the live edge instead of rewinding. Surfaced as a tiny inline note.
  const [dvrUnavailable, setDvrUnavailable] = useState(false)
  const dvrCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearDvrCheck = useCallback(() => {
    if (dvrCheckRef.current) {
      clearTimeout(dvrCheckRef.current)
      dvrCheckRef.current = null
    }
  }, [])

  const markers = useMemo(() => sortMarkers(web.markers ?? []), [web.markers])

  // Spin up the controllable player. The monitor is keyed by the present-nonce
  // upstream, so re-presenting the same item remounts this and replays from the
  // top.
  useEffect(() => {
    // Cue paused unless the item opts into autoplay — the operator presses Play.
    if (isYouTube) void loadVideo(web.videoId!, web.autoplay ?? false)
  }, [isYouTube, web.videoId, web.autoplay, loadVideo])

  // Going off-air must stop playback everywhere: pause this booth player and
  // tell the audience overlay to pause too (it is also closed by setLive, but
  // pausing first guarantees silence even if the close races). Without this the
  // video keeps playing after the operator flips Live off.
  useEffect(() => {
    if (!onAir) {
      pause()
      sendWeb("pause")
    }
  }, [onAir, pause, sendWeb])

  // Enter at the configured start offset once ready (join-late / skip pre-service).
  const seekedRef = useRef(false)
  useEffect(() => {
    seekedRef.current = false
  }, [web.videoId])
  useEffect(() => {
    if (isReady && !seekedRef.current && startTime > 0) {
      seekedRef.current = true
      seekTo(startTime)
      sendWeb("seek", { position: startTime })
    }
  }, [isReady, startTime, seekTo, sendWeb])

  // Keep the operator's live booth player silent. The audience output plays the
  // program audio (through the same speakers on a single-machine setup), so a
  // second audible player here just doubles/echoes it — and tying it to the
  // audience mute meant silencing the audience also killed the operator's audio.
  // The operator monitors program audio from the staged Program preview instead
  // (which has its own independent audio toggle).
  useEffect(() => {
    if (!isReady) return
    if (!isMuted) toggleMute()
  }, [isReady, isMuted, toggleMute])

  const togglePlay = useCallback(() => {
    if (playing) {
      pause()
      sendWeb("pause")
    } else {
      // A finished VOD restarts from its start offset rather than sitting on the
      // end-screen; a live stream simply resumes.
      if (!isLive && duration > 0 && position >= duration - 0.5) {
        seekTo(startTime)
        sendWeb("seek", { position: startTime })
      }
      play()
      sendWeb("play")
    }
  }, [
    playing,
    pause,
    play,
    seekTo,
    sendWeb,
    isLive,
    duration,
    position,
    startTime,
  ])

  const commitSeek = useCallback(
    (t: number) => {
      seekTo(t)
      sendWeb("seek", { position: t })
      setDragCurrent(null)
      // Live seek-back probe: if a rewind well behind the edge snaps back to live,
      // the stream has no DVR window — flag it. VOD seeks are always honored.
      clearDvrCheck()
      if (isLive && duration > 0 && duration - t > 10) {
        dvrCheckRef.current = setTimeout(() => {
          const { currentTime: pos, duration: edge } = liveRef.current
          setDvrUnavailable(edge > 0 && pos >= edge - 5)
        }, 1500)
      } else {
        setDvrUnavailable(false)
      }
    },
    [seekTo, sendWeb, isLive, duration, clearDvrCheck]
  )

  const jumpToMarker = useCallback(
    (t: number) => {
      commitSeek(t)
      if (!playing) {
        play()
        sendWeb("play")
      }
    },
    [commitSeek, playing, play, sendWeb]
  )

  const jumpToLive = useCallback(() => {
    clearDvrCheck()
    setDvrUnavailable(false)
    const edge = liveRef.current.duration
    if (edge > 0) {
      seekTo(edge)
      sendWeb("seek", { position: edge })
    }
    play()
    sendWeb("jumpLive")
    setDragCurrent(null)
  }, [seekTo, play, sendWeb, clearDvrCheck])

  const jumpRelative = useCallback(
    (dir: 1 | -1) => {
      const pos = liveRef.current.currentTime
      if (markers.length > 0) {
        const target = findMarkerInDirection(markers, pos, dir)
        if (target) jumpToMarker(target.time)
      } else {
        commitSeek(relativeSeekTarget(pos, dir))
      }
    },
    [markers, jumpToMarker, commitSeek]
  )

  // Operator keyboard shortcuts: space = play/pause, ←/→ = jump markers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.code === "Space") {
        e.preventDefault()
        togglePlay()
      } else if (e.code === "ArrowRight") {
        e.preventDefault()
        jumpRelative(1)
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        jumpRelative(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [togglePlay, jumpRelative])

  // Cancel any pending DVR probe on unmount.
  useEffect(() => clearDvrCheck, [clearDvrCheck])

  // How close to the live edge counts as "at live" (buffer jitter).
  const atLiveEdge = isAtLiveEdge(isLive, duration, position)

  // Non-YouTube web page: passive display, no transport controls.
  if (!isYouTube) {
    return (
      <div className="relative size-full">
        <iframe
          src={src}
          title="Live web output"
          allow="autoplay; encrypted-media"
          className="size-full border-none"
          style={{ pointerEvents: "none" }}
        />
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
          <GlobeIcon className="size-2.5 text-white/70" />
          <span className="text-[0.5rem] text-white/70">Web</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative size-full">
      {/* The YT API replaces this div with the player iframe. pointer-events-none
          so the audience-facing surface can't be clicked directly — all control
          goes through the transport bar below. */}
      <div className="pointer-events-none size-full">
        <div id={containerId} className="size-full" />
      </div>
      {!isReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black">
          <span className="text-[0.625rem] text-white/60">Loading player…</span>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
        <GlobeIcon className="size-2.5 text-white/70" />
        <span className="text-[0.5rem] text-white/70">YouTube</span>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2">
        {(markers.length > 0 || isLive) && (
          <div className="flex flex-wrap items-center gap-1">
            {markers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => jumpToMarker(m.time)}
                className="rounded bg-white/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-white transition-colors hover:bg-white/25"
                title={`Jump to ${formatClock(m.time)}`}
              >
                {m.label}
              </button>
            ))}
            {isLive && (
              <div className="ml-auto flex items-center gap-1">
                {dvrUnavailable && (
                  <span
                    className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[0.625rem] font-medium text-amber-300"
                    title="This live stream has no DVR window, so it can't be rewound. Playback stays at the live edge."
                  >
                    DVR unavailable
                  </span>
                )}
                <button
                  type="button"
                  onClick={jumpToLive}
                  disabled={atLiveEdge}
                  className={cn(
                    "flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold tracking-wide uppercase transition-colors",
                    atLiveEdge
                      ? "bg-red-500/25 text-red-300"
                      : "bg-red-500/80 text-white hover:bg-red-500"
                  )}
                  title="Jump to the live edge"
                >
                  <RadioIcon className="size-2.5" />
                  {atLiveEdge ? "Live" : "Jump to Live"}
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!isReady}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-colors hover:bg-white disabled:opacity-50"
            title={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={Math.min(position, duration || 0)}
            disabled={!isReady || duration <= 0}
            onChange={(e) => {
              // Scrub the operator's player live on every change — onChange fires
              // reliably through a drag, whereas a webview range input often
              // drops the final pointerup (why the seek "rarely worked"). The
              // audience overlay is synced with one seek on release below.
              const t = Number(e.target.value)
              setDragCurrent(t)
              seekTo(t)
            }}
            onPointerUp={(e) =>
              commitSeek(Number((e.target as HTMLInputElement).value))
            }
            onKeyUp={(e) =>
              commitSeek(Number((e.target as HTMLInputElement).value))
            }
            className="h-1 flex-1 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="shrink-0 text-[0.625rem] text-white/80 tabular-nums">
            {formatClock(position)} / {isLive ? "Live" : formatClock(duration)}
          </span>
        </div>
      </div>
    </div>
  )
}
