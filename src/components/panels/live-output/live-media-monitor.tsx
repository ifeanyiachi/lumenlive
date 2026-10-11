import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { nativeLoopEnabled } from "@/lib/media/loop-mode"
import { useBroadcastStore } from "@/stores"
import {
  BROADCAST_EVENTS,
  type MediaProgressPayload,
} from "@/services/broadcast-content-gateway"
import type { LiveMedia } from "@/stores/broadcast-store"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { mediaFitStyle } from "@/lib/media-fit"
import { MediaFitBackdrop } from "@/components/media/media-fit-backdrop"
import { RepeatIcon, MusicIcon } from "lucide-react"

/**
 * Operator monitor for the live media item. Renders a muted mirror of the
 * output plus a single loop-toggle control. Playback rolls automatically when
 * the clip reaches air (see the auto-start effect). The seek scrubber and
 * jump-to-marker chips now live in the Program preview (MediaPreview), which
 * drives the audience output; this mirror follows that true output position via
 * a drift correction so the live display stays faithful to air.
 */
export function LiveMediaMonitor({
  media,
  onAir,
}: {
  media: LiveMedia
  onAir: boolean
}) {
  const { t } = useTranslation("panels")
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  // Surfaced when the media source fails to load or play. Without this a failed
  // load is silent: play() rejects and the mirror looks dead with no clue why
  // (e.g. an unresolvable path in a packaged build).
  const [loadError, setLoadError] = useState<string | null>(null)

  const sendTransport = useBroadcastStore((s) => s.sendMediaTransport)
  const setMediaTransport = useBroadcastStore((s) => s.setMediaTransport)
  const transport = useBroadcastStore((s) => s.mediaTransport)

  // Track the true output position echoed back by the broadcast window. This
  // populates the store's mediaTransport, which the Program-preview scrubber
  // reads and which this monitor's drift correction below follows.
  useTauriEvent<MediaProgressPayload>(BROADCAST_EVENTS.mediaProgress, (p) =>
    setMediaTransport({
      position: p.position,
      duration: p.duration,
      playing: p.playing,
    })
  )

  const src = useMemo(() => safeFileSrc(media.filePath), [media.filePath])

  // The media element failed to load its source — the common cause of "the Play
  // button does nothing" in packaged builds (an unresolvable/unreadable path).
  // Report the offending path so the failure is diagnosable, not silent.
  const handleMediaError = useCallback(() => {
    const el = mediaRef.current
    const code = el && "error" in el ? el.error?.code : undefined
    console.error(
      "[live-media] failed to load media",
      { filePath: media.filePath, src, code },
      el && "error" in el ? el.error : undefined
    )
    setLoadError(media.filePath)
  }, [media.filePath, src])

  // Full-length loops use the element's native loop attribute so the operator
  // monitor loops in lockstep with the audience output. Trimmed loops are still
  // handled manually in handleTime (return to trimStart at trimEnd).
  const loopNative = nativeLoopEnabled(media)

  // Start (or restart) the clip from its in-point and forward the matching
  // transport to the audience output. Shared by the auto-start-on-air effect so
  // the operator mirror and the output roll through one proven path.
  const playFromStart = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    // Play always restarts from the in-point, so it plays the clip again from
    // the beginning at the current configuration rather than resuming.
    const start = media.trimStart ?? 0
    try {
      el.currentTime = start
    } catch {
      /* not seekable yet */
    }
    sendTransport("seek", start)
    sendTransport("play")
    // The output window is the timing authority. This local mirror starts from
    // the output's confirmed progress echo in the effect below.
    setLoadError(null)
  }, [sendTransport, media.trimStart])

  // Auto-start playback when a clip reaches the live display. Sending a video or
  // audio item to air (double-click, Go Live, Take, remote) should roll it
  // immediately rather than holding on the first frame. Fires once per mounted
  // clip — the component is keyed by file path, so a newly presented clip
  // remounts and re-arms this — and needs the element ready (metadata loaded),
  // so it's invoked both from the onAir effect and once the source loads
  // (handleLoaded), whichever settles last.
  const autoStartedRef = useRef(false)
  const maybeAutoStart = useCallback(() => {
    if (media.mediaType === "image") return
    if (!onAir || autoStartedRef.current) return
    const el = mediaRef.current
    if (!el || el.readyState < 1 /* HAVE_METADATA */) return
    autoStartedRef.current = true
    playFromStart()
  }, [onAir, media.mediaType, playFromStart])

  const handleLoaded = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
    setLoadError(null)
    if (media.trimStart) {
      try {
        el.currentTime = media.trimStart
      } catch {
        /* not seekable yet */
      }
    }
    maybeAutoStart()
  }, [media.trimStart, maybeAutoStart])

  const handleTime = useCallback(() => {
    const el = mediaRef.current
    if (!el) return
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
  }, [media.trimEnd, media.trimStart, media.loop, media.endAction])

  // `loop` and an `endAction` of "loop" both make the clip repeat, so either
  // means "looping" for the toggle's lit state.
  const isLooping = media.loop === true || media.endAction === "loop"

  // Toggle looping on the live clip (and the audience output) without restarting
  // playback. Turning it off also clears an "endAction: loop", which would
  // otherwise keep the clip repeating regardless of the `loop` flag.
  const toggleLoop = useCallback(() => {
    useBroadcastStore.getState().updateLiveMediaPlayback(
      isLooping
        ? {
            loop: false,
            endAction: media.endAction === "loop" ? "hold" : media.endAction,
          }
        : { loop: true }
    )
  }, [isLooping, media.endAction])

  const setElRef = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el
  }, [])

  // Roll the clip as soon as it's on air. Runs on mount and whenever it goes
  // live; if the source hasn't loaded its metadata yet, handleLoaded picks it up
  // once it does. The ref guard keeps it to a single start per mounted clip.
  useEffect(() => {
    maybeAutoStart()
  }, [maybeAutoStart])

  // Follow the true output position echoed back from the audience window. The
  // seek control lives in the Program preview now and drives the audience
  // directly; without this, a seek there would move the audience while this
  // mirror kept playing from where it was. The output is the timing authority:
  // start this mirror only after the output reports playing, and correct small
  // but visible drift as well as seeks.
  useEffect(() => {
    const el = mediaRef.current
    if (!el || transport == null) return
    if (Math.abs(el.currentTime - transport.position) > 0.1) {
      try {
        el.currentTime = transport.position
      } catch {
        /* not seekable yet */
      }
    }
    if (transport.playing) {
      if (el.paused) {
        void el.play().catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return
          console.error("[live-media] play() rejected", {
            filePath: media.filePath,
            err,
          })
          setLoadError(media.filePath)
        })
      }
    } else if (!el.paused) {
      el.pause()
    }
  }, [transport, media.filePath])

  // Going off-air stops playback: pause the booth element and forward a pause to
  // the audience output so its <video>/<audio> stops too. Without this, media
  // (and its audio) keeps running after the operator flips Live off.
  useEffect(() => {
    if (onAir) return
    const el = mediaRef.current
    if (el && !el.paused) el.pause()
    sendTransport("pause")
    // Re-arm so taking this same (still-mounted) clip back to air rolls it again
    // from the in-point rather than sitting frozen where it was paused.
    autoStartedRef.current = false
  }, [onAir, sendTransport])

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
              loop={loopNative}
              playsInline
              className="relative aspect-video max-h-full max-w-full"
              style={mediaFitStyle(media)}
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={handleTime}
              onError={handleMediaError}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3">
            <MusicIcon className="size-10 text-muted-foreground/50" />
            <audio
              ref={setElRef}
              src={src}
              muted
              loop={loopNative}
              onLoadedMetadata={handleLoaded}
              onTimeUpdate={handleTime}
              onError={handleMediaError}
            />
          </div>
        )}

        {loadError === media.filePath && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 px-4 text-center">
            <p className="text-xs font-medium text-destructive">
              {t("liveMedia.loadFailed")}
            </p>
            <p className="max-w-full truncate text-[0.625rem] text-white/60">
              {loadError}
            </p>
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2">
        <button
          type="button"
          onClick={toggleLoop}
          aria-pressed={isLooping}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
            isLooping
              ? "bg-emerald-400 text-black hover:bg-emerald-300"
              : "bg-white/90 text-black hover:bg-white"
          )}
          title={t("liveMedia.loop")}
        >
          <RepeatIcon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
