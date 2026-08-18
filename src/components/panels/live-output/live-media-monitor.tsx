import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import { useBroadcastStore } from "@/stores"
import {
  BROADCAST_EVENTS,
  type MediaProgressPayload,
} from "@/services/broadcast-content-gateway"
import type { LiveMedia } from "@/stores/broadcast-store"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { mediaFitStyle } from "@/lib/media-fit"
import { MediaFitBackdrop } from "@/components/media/media-fit-backdrop"
import { PlayIcon, PauseIcon, MusicIcon } from "lucide-react"
import {
  sortMarkers,
  findMarkerInDirection,
  relativeSeekTarget,
} from "@/lib/live-output/markers"
import { formatClock, resolveMediaDisplay } from "@/lib/live-output/transport"

/**
 * Operator monitor for the live media item. Renders a muted mirror of the
 * output plus a transport bar: primary play/pause and jump-to-marker chips,
 * with a secondary scrubber. Every action drives this local monitor for
 * instant feedback AND forwards to the broadcast output(s) via
 * sendMediaTransport, so the audience feed follows.
 */
export function LiveMediaMonitor({
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
