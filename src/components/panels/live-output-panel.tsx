import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { PanelHeader } from "@/components/ui/panel-header"
import { CanvasVerse } from "@/components/ui/canvas-verse"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import { useBroadcastStore, useBibleStore, useQueueStore } from "@/stores"
import { findOutput } from "@/lib/broadcast/output-selectors"
import {
  BROADCAST_EVENTS,
  type MediaProgressPayload,
  type WebProgressPayload,
} from "@/services/broadcast-content-gateway"
import { OverlayCanvas } from "@/components/broadcast/overlay-canvas"
import type { LiveMedia, LiveWeb } from "@/stores/broadcast-store"
import { toVerseRenderData, presentQueueVerse } from "@/hooks/use-broadcast"
import { focusBroadcastWindow } from "@/services/broadcast-window-gateway"
import { resolveBaseTheme } from "@/lib/broadcast/base-theme"
import { shouldStageManualVerse } from "@/lib/broadcast/follow-manual-verse"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { SlideCanvas } from "@/components/slides/slide-canvas"
import { mediaFitStyle } from "@/lib/media-fit"
import { MediaFitBackdrop } from "@/components/media/media-fit-backdrop"
import {
  Volume2Icon,
  VolumeXIcon,
  GlobeIcon,
  PlayIcon,
  PauseIcon,
  MusicIcon,
  LayersIcon,
  ImageIcon,
  RadioIcon,
  MonitorOffIcon,
  EyeOffIcon,
  SlidersHorizontalIcon,
  ChevronDownIcon,
  MonitorUpIcon,
} from "lucide-react"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
import { useYouTubePlayer } from "@/hooks/use-youtube-player"
import { PropsManager } from "@/components/props/props-manager"
import {
  sortMarkers,
  findMarkerInDirection,
  relativeSeekTarget,
} from "@/lib/live-output/markers"
import {
  formatClock,
  resolveMediaDisplay,
  isAtLiveEdge,
} from "@/lib/live-output/transport"
import { applyMuteParam } from "@/lib/live-output/presentation"

/**
 * Operator monitor for the live media item. Renders a muted mirror of the
 * output plus a transport bar: primary play/pause and jump-to-marker chips,
 * with a secondary scrubber. Every action drives this local monitor for
 * instant feedback AND forwards to the broadcast output(s) via
 * sendMediaTransport, so the audience feed follows.
 */
function LiveMediaMonitor({
  media,
  onAir,
}: {
  media: LiveMedia
  onAir: boolean
}) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  // Cue paused — playback starts when the operator presses Play (which also
  // forwards to the audience output). Nothing auto-plays on going live.
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)

  const sendTransport = useBroadcastStore((s) => s.sendMediaTransport)
  const setMediaTransport = useBroadcastStore((s) => s.setMediaTransport)
  const transport = useBroadcastStore((s) => s.mediaTransport)

  // Track the true output position echoed back by the broadcast window.
  useTauriEvent<MediaProgressPayload>(BROADCAST_EVENTS.mediaProgress, (p) =>
    setMediaTransport({
      position: p.position,
      duration: p.duration,
      playing: p.playing,
    })
  )

  const src = useMemo(() => safeFileSrc(media.filePath), [media.filePath])

  const markers = useMemo(
    () => sortMarkers(media.markers ?? []),
    [media.markers]
  )

  const handleLoaded = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    setDuration(Number.isFinite(el.duration) ? el.duration : 0)
    if (media.trimStart) {
      try {
        el.currentTime = media.trimStart
      } catch {
        /* not seekable yet */
      }
    }
  }, [media.trimStart])

  const handleTime = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    if (!dragging) setCurrent(el.currentTime)
    if (media.trimEnd != null && el.currentTime >= media.trimEnd) {
      if (media.loop || media.endAction === "loop") {
        try {
          el.currentTime = media.trimStart ?? 0
        } catch {
          /* not seekable */
        }
      } else {
        el.pause()
      }
    }
  }, [dragging, media.trimEnd, media.trimStart, media.loop, media.endAction])

  const togglePlay = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    if (el.paused) {
      // Play always restarts from the in-point, so it plays the clip again from
      // the beginning at the current configuration rather than resuming.
      const start = media.trimStart ?? 0
      try {
        el.currentTime = start
      } catch {
        /* not seekable yet */
      }
      setCurrent(start)
      sendTransport("seek", start)
      void el.play()
      sendTransport("play")
    } else {
      el.pause()
      sendTransport("pause")
    }
  }, [sendTransport, media.trimStart])

  const seekLocal = useCallback((t: number) => {
    const el = mediaRef.current
    if (el) {
      try {
        el.currentTime = t
      } catch {
        /* not seekable */
      }
    }
    setCurrent(t)
  }, [])

  const commitSeek = useCallback(
    (t: number) => {
      seekLocal(t)
      sendTransport("seek", t)
    },
    [seekLocal, sendTransport]
  )

  const jumpToMarker = useCallback(
    (t: number) => {
      const el = mediaRef.current
      commitSeek(t)
      if (el && el.paused) {
        void el.play()
        sendTransport("play")
      }
    },
    [commitSeek, sendTransport]
  )

  const setElRef = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el
  }, [])

  const jumpRelative = useCallback(
    (dir: 1 | -1) => {
      const pos = transport?.position ?? mediaRef.current?.currentTime ?? 0
      if (markers.length > 0) {
        const target = findMarkerInDirection(markers, pos, dir)
        if (target) jumpToMarker(target.time)
      } else {
        commitSeek(relativeSeekTarget(pos, dir))
      }
    },
    [markers, transport, jumpToMarker, commitSeek]
  )

  // Going off-air stops playback: pause the booth element and forward a pause to
  // the audience output so its <video>/<audio> stops too. Without this, media
  // (and its audio) keeps running after the operator flips Live off.
  useEffect(() => {
    if (onAir) return
    const el = mediaRef.current
    if (el && !el.paused) el.pause()
    sendTransport("pause")
  }, [onAir, sendTransport])

  // Operator keyboard shortcuts: space = play/pause, ←/→ = jump markers.
  useEffect(() => {
    if (media.mediaType === "image") return
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
  }, [media.mediaType, togglePlay, jumpRelative])

  const {
    duration: displayDuration,
    current: displayCurrent,
    playing: displayPlaying,
  } = resolveMediaDisplay({
    transport,
    dragging,
    localCurrent: current,
    localDuration: duration,
    localPlaying: playing,
  })

  if (media.mediaType === "image") {
    return (
      <div className="relative flex size-full items-center justify-center overflow-hidden">
        <MediaFitBackdrop media={media} src={src} />
        {/* 16:9 output frame, letterboxed into the panel: the image fits inside
            this frame exactly as it does on the audience 1920×1080 canvas, so the
            operator sees the same crop instead of one cropped to the panel shape. */}
        <img
          src={src}
          alt=""
          className="relative aspect-video max-h-full max-w-full"
          style={mediaFitStyle(media)}
        />
      </div>
    )
  }

  const isVideo = media.mediaType === "video"

  return (
    <div className="relative flex size-full flex-col">
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {isVideo ? (
          <>
            <MediaFitBackdrop media={media} src={src} />
            {/* 16:9 output frame (see LiveMediaMonitor's image branch). */}
            <video
              ref={setElRef}
              src={src}
              muted
              playsInline
              className="relative aspect-video max-h-full max-w-full"
              style={mediaFitStyle(media)}
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={handleTime}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3">
            <MusicIcon className="size-10 text-muted-foreground/50" />
            <audio
              ref={setElRef}
              src={src}
              muted
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={handleTime}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            />
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2">
        {markers.length > 0 && (
          <div className="flex flex-wrap gap-1">
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
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={togglePlay}
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-colors hover:bg-white"
            title={displayPlaying ? "Pause" : "Play"}
          >
            {displayPlaying ? (
              <PauseIcon className="size-3.5" />
            ) : (
              <PlayIcon className="size-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={displayDuration || 0}
            step={0.05}
            value={Math.min(displayCurrent, displayDuration || 0)}
            onPointerDown={() => setDragging(true)}
            onChange={(e) => seekLocal(Number(e.target.value))}
            onPointerUp={(e) => {
              setDragging(false)
              commitSeek(Number((e.target as HTMLInputElement).value))
            }}
            onKeyUp={(e) =>
              commitSeek(Number((e.target as HTMLInputElement).value))
            }
            className="h-1 flex-1 cursor-pointer accent-emerald-400"
          />
          <span className="shrink-0 text-[0.625rem] text-white/80 tabular-nums">
            {formatClock(displayCurrent)} / {formatClock(displayDuration)}
          </span>
        </div>
      </div>
    </div>
  )
}

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
function LiveWebMonitor({
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

export function LiveOutputPanel() {
  const isLive = useBroadcastStore((s) => s.isLive)
  const themes = useBroadcastStore((s) => s.themes)
  const activeThemeId = useBroadcastStore(
    (s) => findOutput(s.outputs, "main")?.themeId ?? ""
  )
  const mainOutput = useBroadcastStore((s) => findOutput(s.outputs, "main"))
  const interlinearText = useBroadcastStore((s) => s.interlinearText)
  const liveVersePages = useBroadcastStore((s) => s.liveVersePages)
  const liveVersePageIndex = useBroadcastStore((s) => s.liveVersePageIndex)
  const liveMedia = useBroadcastStore((s) => s.liveMedia)
  const liveSlide = useBroadcastStore((s) => s.liveSlide)
  const broadcastMuted = useBroadcastStore((s) => s.broadcastMuted)
  const liveWeb = useBroadcastStore((s) => s.liveWeb)
  const blackout = useBroadcastStore((s) => s.blackout)
  const clearForeground = useBroadcastStore((s) => s.clearForeground)
  const showLogo = useBroadcastStore((s) => s.showLogo)
  const logoImagePath = useBroadcastStore((s) => s.logoImagePath)
  const baseBackground = useBroadcastStore((s) => s.baseBackground)
  const liveWebUrl = useMemo(() => {
    if (!liveWeb) return null
    return applyMuteParam(liveWeb.url, broadcastMuted, !!liveWeb.isYouTube)
  }, [liveWeb, broadcastMuted])
  const mediaLayer = useBroadcastStore((s) => s.mediaLayer)

  const selectedVerse = useBibleStore((s) => s.selectedVerse)
  const translations = useBibleStore((s) => s.translations)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)

  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? themes[0]
  // Central base theme resolved from the configured base background (theme or a
  // synthesized background-only theme), else this output's own theme. Revealed
  // in the preview on Clear.
  const baseTheme = resolveBaseTheme(baseBackground, activeTheme, themes)
  const translation =
    translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
    "KJV"

  const liveVerse = useBroadcastStore((s) => s.liveVerse)

  // Mirror the operator's manual Bible selection into the Program preview so it
  // is ready to take live — but only as a genuine *follow* of the selection, not
  // as a side effect of flipping Live on (which would otherwise auto-stage the
  // always-present default selection; see shouldStageManualVerse). Track the
  // previous Live state to detect the off→on transition, and read preview state
  // via getState() so this effect isn't re-bound on every store tick.
  const wasLiveRef = useRef(isLive)
  useEffect(() => {
    const bs = useBroadcastStore.getState()
    const wasLive = wasLiveRef.current
    wasLiveRef.current = isLive
    if (
      !shouldStageManualVerse({
        isLive,
        wasLive,
        hasSelection: selectedVerse !== null,
        previewPending: bs.previewPending,
        previewSource: bs.previewSource,
      })
    ) {
      return
    }
    bs.setLiveVerse(
      toVerseRenderData(selectedVerse!, translation, interlinearText),
      "manual"
    )
  }, [isLive, selectedVerse, translation, interlinearText])

  // The operator's live booth player stays muted (see LiveWebMonitor); the
  // audience overlay is muted separately in setBroadcastMuted. Nothing to do
  // here.

  // Position echo from the controllable YouTube overlay (audience output). The
  // operator monitor drives itself now, so this is kept only so `webTransport`
  // reflects the true audience position for any external readers.
  useTauriEvent<WebProgressPayload>(BROADCAST_EVENTS.webProgress, (payload) =>
    useBroadcastStore.getState().setWebTransport(payload)
  )

  const [propsOpen, setPropsOpen] = useState(false)

  // Enter is the keyboard path to live (mirrors the schedule play icon and the
  // Go Live button). It is a deliberate two-step so a verse never reaches the
  // audience on a single stray keypress:
  //   1st Enter — with nothing staged but a verse "active" in the AI-detections
  //   queue (e.g. one that just auto-detected), stage that verse into the
  //   Program preview so the operator can see it. This is why Enter used to do
  //   nothing after an auto-detection: the active row was never staged.
  //   2nd Enter — commit the staged preview to the audience.
  // Space/←/→ are reserved by the media/web monitors. Ignored while typing.
  useEffect(() => {
    if (!isLive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Enter" && e.code !== "NumpadEnter") return
      if (isEditableTarget(e.target)) return
      if (!useBroadcastStore.getState().previewPending) {
        // Nothing staged yet — fall back to the active queue verse and stage it
        // (first Enter). A second Enter then commits it below.
        const q = useQueueStore.getState()
        const item = q.activeIndex != null ? q.items[q.activeIndex] : undefined
        if (!item || q.activeIndex == null) return
        e.preventDefault()
        presentQueueVerse(item, q.activeIndex)
        return
      }
      e.preventDefault()
      useBroadcastStore.getState().takeToLive()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isLive])

  // Arrow keys step through pages of a long paginated verse. Only active while a
  // paginated verse is live (media/web own the arrows in their own modes, but
  // those are never live at the same time as a verse). Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "ArrowRight" && e.code !== "ArrowLeft") return
      if (isEditableTarget(e.target)) return
      const st = useBroadcastStore.getState()
      if (!st.liveVersePages) return
      e.preventDefault()
      if (e.code === "ArrowRight") st.nextVersePage()
      else st.prevVersePage()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Ctrl/Cmd+B = Black (cut to black), Ctrl/Cmd+C = Clear (hide text),
  // Ctrl/Cmd+L = Logo (holding image). Only while live, requires the Ctrl/Cmd
  // modifier (Alt excluded), and ignored while typing in a field.
  useEffect(() => {
    if (!isLive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyB" && e.code !== "KeyC" && e.code !== "KeyL") return
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      const st = useBroadcastStore.getState()
      if (e.code === "KeyB") st.toggleBlackout()
      else if (e.code === "KeyC") st.toggleClearForeground()
      else st.toggleLogo()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isLive])

  // Priority cascade (web > media > slide > verse). Kept as inline null-checks so
  // TypeScript narrows liveWeb/liveMedia/liveSlide at the JSX call sites below.
  const showWeb = liveWeb !== null
  const showMedia = !showWeb && liveMedia !== null
  const showSlide = !showWeb && !showMedia && liveSlide !== null
  const showVideoControls =
    showMedia &&
    (liveMedia.mediaType === "video" || liveMedia.mediaType === "audio")
  const showWebControls = showWeb

  return (
    <div
      data-slot="live-output-panel"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        isLive && "shadow-[inset_0_2px_0_0_rgba(16,185,129,0.3)]"
      )}
    >
      <PanelHeader title="Live display">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setPropsOpen(true)}
            title="Props / Overlays"
          >
            <LayersIcon className="size-3.5" />
          </Button>
          <PropsManager open={propsOpen} onOpenChange={setPropsOpen} />
          {/* Bring the projector output back to the front. The projector is a
              shared display — the operator can switch another app (a browser
              video, a Chrome page) onto it mid-service, then tap this to return
              the congregation to Lumen. The output window is hidden from the
              taskbar/alt-tab, so this is the only way to raise it again. Shown
              only when the Display Output is active. */}
          {isTauri && mainOutput?.enabled && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => void focusBroadcastWindow("main").catch(() => {})}
              title="Show LumenLive on the projector (bring output to front)"
            >
              <MonitorUpIcon className="size-3.5" />
            </Button>
          )}
          {(showVideoControls || showWebControls) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                useBroadcastStore.getState().setBroadcastMuted(!broadcastMuted)
              }
              title={
                broadcastMuted
                  ? "Unmute broadcast audio"
                  : "Mute broadcast audio"
              }
              className={cn(broadcastMuted && "text-red-400")}
            >
              {broadcastMuted ? (
                <VolumeXIcon className="size-3.5" />
              ) : (
                <Volume2Icon className="size-3.5" />
              )}
            </Button>
          )}
          {/* Audience-screen controls (clear / black / logo) live in one menu to
              keep the header uncluttered. Content only reaches the audience via an
              explicit take (schedule play icon, Enter, or the preview Go Live). */}
          {isLive && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Audience screen — clear, black, logo"
                    className={cn(
                      "h-6 gap-1 px-2 text-[0.625rem] font-semibold tracking-wider uppercase",
                      blackout
                        ? "text-red-400"
                        : clearForeground || showLogo
                          ? "text-amber-400"
                          : "text-muted-foreground"
                    )}
                  >
                    <SlidersHorizontalIcon className="size-3.5" />
                    Screen
                    <ChevronDownIcon className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Audience screen</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={clearForeground}
                    onCheckedChange={() =>
                      useBroadcastStore.getState().toggleClearForeground()
                    }
                  >
                    <EyeOffIcon className="size-3.5" />
                    Clear (hide text)
                    <DropdownMenuShortcut>Ctrl+C</DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={blackout}
                    onCheckedChange={() =>
                      useBroadcastStore.getState().toggleBlackout()
                    }
                  >
                    <MonitorOffIcon className="size-3.5" />
                    Black (cut to black)
                    <DropdownMenuShortcut>Ctrl+B</DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={showLogo}
                    disabled={!logoImagePath}
                    title={
                      logoImagePath
                        ? undefined
                        : "Set a logo image in Broadcast settings first"
                    }
                    onCheckedChange={() =>
                      useBroadcastStore.getState().toggleLogo()
                    }
                  >
                    <ImageIcon className="size-3.5" />
                    Logo (holding image)
                    <DropdownMenuShortcut>Ctrl+L</DropdownMenuShortcut>
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <label className="flex items-center gap-2">
            <span
              className={cn(
                "text-[0.625rem] font-medium tracking-wider uppercase transition-colors",
                isLive ? "text-emerald-400" : "text-muted-foreground"
              )}
            >
              {isLive ? "Live" : "Go live"}
            </span>
            <Switch
              checked={isLive}
              onCheckedChange={(checked) =>
                useBroadcastStore.getState().setLive(checked)
              }
              className="data-[state=checked]:bg-emerald-500"
            />
          </label>
        </div>
      </PanelHeader>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-3 transition-opacity",
          !isLive && "opacity-40"
        )}
      >
        {mediaLayer?.active && (
          <div className="absolute inset-3 z-0 overflow-hidden">
            {mediaLayer.mediaType === "video" ? (
              <video
                key={mediaLayer.filePath}
                src={safeFileSrc(mediaLayer.filePath)}
                autoPlay
                muted
                loop
                playsInline
                className="size-full object-cover"
              />
            ) : (
              <img
                src={safeFileSrc(mediaLayer.filePath)}
                alt=""
                className="size-full object-cover"
              />
            )}
          </div>
        )}
        <div className="relative z-10 flex size-full items-center justify-center">
          {clearForeground ? (
            // Clear reveals the central base theme (no content) — consistent
            // across verse / slide / song, mirroring the audience output.
            <CanvasVerse
              theme={baseTheme}
              verse={null}
              animate
              verseAutoFit={mainOutput?.verseAutoFit ?? true}
              maxVerseScale={mainOutput?.maxVerseScale ?? 1.5}
              minVerseFontSize={mainOutput?.minVerseFontSize ?? 40}
            />
          ) : showWeb ? (
            <LiveWebMonitor
              key={`${liveWeb.videoId ?? liveWeb.url}:${liveWeb.nonce ?? 0}`}
              web={liveWeb}
              src={liveWebUrl!}
              onAir={isLive}
            />
          ) : showMedia ? (
            <LiveMediaMonitor
              key={liveMedia.filePath}
              media={liveMedia}
              onAir={isLive}
            />
          ) : showSlide ? (
            <SlideCanvas slide={liveSlide} />
          ) : (
            <CanvasVerse
              theme={activeTheme}
              verse={liveVerse}
              animate
              verseAutoFit={mainOutput?.verseAutoFit ?? true}
              maxVerseScale={mainOutput?.maxVerseScale ?? 1.5}
              minVerseFontSize={mainOutput?.minVerseFontSize ?? 40}
            />
          )}
        </div>
        {/* Single overlay layer (props / alerts / countdowns) drawn through the
            audience canvas painters — a faithful mirror of the projector/NDI feed,
            not a second DOM implementation. Below the Logo/Black finishers (z-20)
            so Black covers it, matching the audience compositor's paint order. */}
        <OverlayCanvas />
        {/* Logo holding image: mirror the audience by covering the preview with
            the logo on black. Below the Black overlay so Black still wins. */}
        {isLive && showLogo && logoImagePath && (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center bg-black">
            <img
              src={safeFileSrc(logoImagePath)}
              alt=""
              className="max-h-full max-w-full object-contain"
            />
          </div>
        )}
        {/* Black cut: mirror the audience by covering the whole preview (over
            content AND overlays). pointer-events-none so the page-nav below still
            works. Clear needs no overlay — the verse renders background-only. */}
        {isLive && blackout && (
          <div className="pointer-events-none absolute inset-3 z-20 bg-black" />
        )}
        {liveVersePages && liveVersePages.length > 1 && (
          <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white backdrop-blur">
            <button
              type="button"
              disabled={liveVersePageIndex === 0}
              onClick={() => useBroadcastStore.getState().prevVersePage()}
              className="rounded px-1.5 py-0.5 hover:bg-white/15 disabled:opacity-30"
              title="Previous page (←)"
            >
              ‹
            </button>
            <span className="tabular-nums">
              Page {liveVersePageIndex + 1} / {liveVersePages.length}
            </span>
            <button
              type="button"
              disabled={liveVersePageIndex >= liveVersePages.length - 1}
              onClick={() => useBroadcastStore.getState().nextVersePage()}
              className="rounded px-1.5 py-0.5 hover:bg-white/15 disabled:opacity-30"
              title="Next page (→)"
            >
              ›
            </button>
          </div>
        )}
        {mediaLayer?.active && (
          <div className="absolute right-4 bottom-4 z-20 flex items-center gap-1 rounded bg-blue-500/70 px-1.5 py-0.5">
            <ImageIcon className="size-2.5 text-white" />
            <span className="text-[0.5rem] font-medium text-white">BG</span>
          </div>
        )}
        {/* Audience-hidden indicator — priority Black > Logo > Clear. */}
        {isLive && (blackout || showLogo || clearForeground) && (
          <div
            className={cn(
              "absolute top-4 right-4 z-30 flex items-center gap-1 rounded px-1.5 py-0.5",
              blackout ? "bg-red-600/85" : "bg-amber-500/85"
            )}
          >
            {blackout ? (
              <MonitorOffIcon className="size-2.5 text-white" />
            ) : showLogo ? (
              <ImageIcon className="size-2.5 text-white" />
            ) : (
              <EyeOffIcon className="size-2.5 text-white" />
            )}
            <span className="text-[0.5rem] font-semibold tracking-wide text-white uppercase">
              {blackout
                ? "Black · hidden"
                : showLogo
                  ? "Logo"
                  : "Clear · text hidden"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
