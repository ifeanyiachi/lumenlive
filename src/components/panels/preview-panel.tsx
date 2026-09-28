import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { invoke } from "@tauri-apps/api/core"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { trackFeatureUsed } from "@/services/analytics-gateway"
import { PanelHeader } from "@/components/ui/panel-header"
import { ScripturePreview } from "@/components/ui/scripture-preview"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useBibleStore, useBroadcastStore, useSettingsStore } from "@/stores"
import { findOutput } from "@/lib/broadcast/output-selectors"
import type { LiveMedia } from "@/stores/broadcast-store"
import { useCan } from "@/stores/entitlements-store"
import { bibleActions } from "@/hooks/use-bible"
import { toVerseRenderData, takeToLiveOrPrompt } from "@/hooks/use-broadcast"
import { SlideCanvas } from "@/components/slides/slide-canvas"
import { mediaFitStyle } from "@/lib/media-fit"
import { MediaFitBackdrop } from "@/components/media/media-fit-backdrop"
import {
  Volume2Icon,
  VolumeOffIcon,
  GlobeIcon,
  MusicIcon,
  PlayIcon,
  FlagIcon,
} from "lucide-react"
import { PreviewWebMonitor } from "@/components/panels/preview-web-monitor"
import { formatClock, resolveMediaDisplay } from "@/lib/live-output/transport"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import {
  sortMarkers,
  findMarkerInDirection,
  relativeSeekTarget,
} from "@/lib/live-output/markers"

/**
 * Program-preview monitor for a staged media item. This is where the media
 * transport lives (seek scrubber + jump-to-marker chips + ←/→) — mirroring the
 * YouTube split where cueing is done in Program preview and the live display
 * keeps only a minimal control. When the previewed clip is the one currently on
 * air it drives the audience output via sendMediaTransport (and the Live-display
 * mirror follows the echoed position); otherwise the scrubber auditions the
 * staged clip locally without touching the audience.
 */
function MediaPreview({
  media,
  monitorAudio,
}: {
  media: LiveMedia
  monitorAudio: boolean
}) {
  const { t } = useTranslation("panels")
  const { filePath, mediaType } = media
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const src = useMemo(() => {
    try {
      return safeFileSrc(filePath)
    } catch {
      return filePath
    }
  }, [filePath])

  const sendTransport = useBroadcastStore((s) => s.sendMediaTransport)
  const mediaTransport = useBroadcastStore((s) => s.mediaTransport)
  // The transport controls only reach the audience when the staged clip is the
  // one actually on air. Otherwise a seek here would scrub whatever different
  // clip is live — so off-air (or a not-yet-taken clip) the scrubber is local
  // audition only, and the echoed output position is ignored (it belongs to a
  // different clip).
  const isLiveClip = useBroadcastStore(
    (s) => s.isLive && s.liveMedia?.filePath === filePath
  )
  const transport = isLiveClip ? mediaTransport : null

  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [dragging, setDragging] = useState(false)

  const markers = useMemo(
    () => sortMarkers(media.markers ?? []),
    [media.markers]
  )

  const setElRef = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el
  }, [])

  useEffect(() => {
    if (mediaRef.current) mediaRef.current.muted = !monitorAudio
  }, [monitorAudio])

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

  const seekLocal = useCallback((tSec: number) => {
    const el = mediaRef.current
    if (el) {
      try {
        el.currentTime = tSec
      } catch {
        /* not seekable */
      }
    }
    setCurrent(tSec)
  }, [])

  // Seek the local preview element for instant feedback and, when this clip is
  // on air, forward the seek to the audience output. Any committed scrub also
  // stages the preview (previewPending) so the Go Live button lights up.
  const commitSeek = useCallback(
    (tSec: number) => {
      seekLocal(tSec)
      if (isLiveClip) sendTransport("seek", tSec)
      useBroadcastStore.getState().updatePreviewMedia({})
    },
    [seekLocal, isLiveClip, sendTransport]
  )

  // "Set In": stage the current position as the clip's in-point. Taking the
  // preview to air (Go Live) then starts/continues playback from here. Preview
  // only — the audience is untouched until the operator takes it live.
  const setInPoint = useCallback(() => {
    const pos = transport?.position ?? mediaRef.current?.currentTime ?? 0
    useBroadcastStore.getState().updatePreviewMedia({ trimStart: pos })
  }, [transport])

  const jumpToMarker = useCallback(
    (tSec: number) => {
      const el = mediaRef.current
      commitSeek(tSec)
      if (el && el.paused) {
        void el.play()
        if (isLiveClip) sendTransport("play")
      }
    },
    [commitSeek, isLiveClip, sendTransport]
  )

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

  // Operator keyboard shortcuts: ←/→ = jump markers (or ±10s without markers).
  useEffect(() => {
    if (mediaType === "image") return
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.code === "ArrowRight") {
        e.preventDefault()
        jumpRelative(1)
      } else if (e.code === "ArrowLeft") {
        e.preventDefault()
        jumpRelative(-1)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [mediaType, jumpRelative])

  const { duration: displayDuration, current: displayCurrent } =
    resolveMediaDisplay({
      transport,
      dragging,
      localCurrent: current,
      localDuration: duration,
      localPlaying: playing,
    })

  if (mediaType === "image") {
    return (
      <div className="relative flex size-full items-center justify-center overflow-hidden">
        <MediaFitBackdrop media={media} src={src} />
        {/* 16:9 output frame (see the video branch): the image is cropped to the
            audience frame, not to the panel's aspect ratio. */}
        <img
          src={src}
          alt=""
          className="relative aspect-video max-h-full max-w-full"
          style={mediaFitStyle(media)}
        />
      </div>
    )
  }

  const transportBar = (
    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pt-6 pb-2">
      {markers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {markers.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => jumpToMarker(m.time)}
              className="rounded bg-white/15 px-1.5 py-0.5 text-[0.625rem] font-medium text-white transition-colors hover:bg-white/25"
              title={t("liveMedia.jumpTo", { time: formatClock(m.time) })}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={setInPoint}
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/90 text-black transition-colors hover:bg-white"
          title={t("liveMedia.setIn")}
        >
          <FlagIcon className="size-3.5" />
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
  )

  if (mediaType === "video") {
    return (
      <div className="relative flex size-full items-center justify-center overflow-hidden">
        <MediaFitBackdrop media={media} src={src} />
        {/* 16:9 output frame, letterboxed into the panel: the media fits inside
            this frame exactly as it does on the audience 1920×1080 canvas, so the
            operator sees the same crop instead of one cropped to the panel shape. */}
        <video
          ref={setElRef}
          key={filePath}
          src={src}
          autoPlay
          muted={!monitorAudio}
          playsInline
          className="relative aspect-video max-h-full max-w-full"
          style={mediaFitStyle(media)}
          onLoadedMetadata={handleLoaded}
          onTimeUpdate={handleTime}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {transportBar}
      </div>
    )
  }

  return (
    <div className="relative flex size-full flex-col items-center justify-center gap-3">
      <MusicIcon className="size-12 text-muted-foreground/50" />
      <audio
        ref={setElRef}
        key={filePath}
        src={src}
        autoPlay
        muted={!monitorAudio}
        onLoadedMetadata={handleLoaded}
        onTimeUpdate={handleTime}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {transportBar}
    </div>
  )
}

export function PreviewPanel() {
  const { t } = useTranslation("panels")
  const selectedVerse = useBibleStore((s) => s.selectedVerse)
  const translations = useBibleStore((s) => s.translations)
  const activeTranslationId = useBibleStore((s) => s.activeTranslationId)
  // The Program preview reads the staged `preview*` fields (not `live*`):
  // presenting an item always stages here, and it only reaches the audience when
  // the operator takes it live (play icon / Enter / the Go Live button below).
  const liveMedia = useBroadcastStore((s) => s.previewMedia)
  const liveSlide = useBroadcastStore((s) => s.previewSlide)
  const liveWeb = useBroadcastStore((s) => s.previewWeb)
  const previewPending = useBroadcastStore((s) => s.previewPending)
  const isLive = useBroadcastStore((s) => s.isLive)
  // The Greek/Hebrew interlinear toggle is part of the lexicon feature — hidden
  // everywhere when the feature is off in Bible settings.
  // Lexicon/word-study is a Pro feature; gate the interlinear behind it too.
  const lexiconSetting = useSettingsStore((s) => s.lexiconEnabled)
  const hasLexicon = useCan("lexicon")
  const lexiconEnabled = lexiconSetting && hasLexicon

  const [interlinearOn, setInterlinearOn] = useState(false)
  const [interlinearText, setInterlinearText] = useState<string | null>(null)
  const interlinearCache = useRef<Map<string, string>>(new Map())
  const [monitorAudio, setMonitorAudio] = useState(false)

  useEffect(() => {
    const verse = useBibleStore.getState().selectedVerse
    if (
      verse &&
      verse.book_number > 0 &&
      verse.chapter > 0 &&
      verse.verse > 0
    ) {
      bibleActions
        .fetchVerse(verse.book_number, verse.chapter, verse.verse)
        .then((v) => {
          if (v) bibleActions.selectVerse(v)
        })
        .catch(() => {})
    }
  }, [activeTranslationId])

  // Reset interlinear view when the selected verse changes.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setInterlinearText(null)
    setInterlinearOn(false)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedVerse?.id])

  // Turning the lexicon feature off mid-session drops any active interlinear
  // overlay so it doesn't linger on the preview (and output).
  useEffect(() => {
    if (lexiconEnabled) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setInterlinearOn(false)
    setInterlinearText(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [lexiconEnabled])

  const activeThemeId = useBroadcastStore(
    (s) => findOutput(s.outputs, "main")?.themeId ?? ""
  )
  const mainOutput = useBroadcastStore((s) => findOutput(s.outputs, "main"))
  const translation =
    translations.find((t) => t.id === activeTranslationId)?.abbreviation ??
    "KJV"

  // OT books are 1–39 (Hebrew), NT is 40+ (Greek). Both testaments have
  // interlinear data — `get_annotated_verse` is language-agnostic — so the
  // toggle is offered for either; `isNT` only picks the button's He/Gr label.
  const isNT = selectedVerse ? selectedVerse.book_number > 39 : false

  const toggleInterlinear = useCallback(async () => {
    if (!selectedVerse) return

    // Toggling interlinear is a manual audition of the selected verse: release
    // any queue/schedule pin so both the Program preview and the live output
    // reflect it. Without this, a verse presented from the schedule keeps the
    // preview pinned to its staged copy and the toggle appears to do nothing.
    useBroadcastStore.getState().followManualSelection()

    if (interlinearOn) {
      setInterlinearOn(false)
      setInterlinearText(null)
      return
    }

    // Past this point the operator is turning interlinear ON — a deliberate use
    // of the Greek/Hebrew lexicon feature (deduped once per session).
    trackFeatureUsed("lexicon")

    const cacheKey = `${selectedVerse.book_number}:${selectedVerse.chapter}:${selectedVerse.verse}:${activeTranslationId}`
    const cached = interlinearCache.current.get(cacheKey)
    if (cached) {
      setInterlinearText(cached)
      setInterlinearOn(true)
      return
    }

    try {
      const result = await invoke<string | null>("get_annotated_verse", {
        bookNumber: selectedVerse.book_number,
        chapter: selectedVerse.chapter,
        verse: selectedVerse.verse,
        englishText: selectedVerse.text,
      })
      if (result) {
        interlinearCache.current.set(cacheKey, result)
        setInterlinearText(result)
        setInterlinearOn(true)
      }
    } catch {
      console.warn("[preview] Failed to fetch interlinear text")
    }
  }, [selectedVerse, interlinearOn, activeTranslationId])

  // Staged verse + its source (mirrors live while unlocked; holds the audition
  // while locked) — so a queue/schedule verse previews correctly either way.
  const previewVerse = useBroadcastStore((s) => s.previewVerse)
  const previewSource = useBroadcastStore((s) => s.previewSource)

  // Memoise so `ScripturePreview`'s memo holds: without this, the manual branch
  // builds a fresh `toVerseRenderData` object every render, so any unrelated
  // broadcast-store change (media transport ticks, etc.) would repaint the canvas.
  const verseData = useMemo(
    () =>
      previewSource === "queue" || previewSource === "schedule"
        ? previewVerse
        : selectedVerse
          ? toVerseRenderData(
              selectedVerse,
              translation,
              interlinearOn ? interlinearText : null
            )
          : null,
    [
      previewSource,
      previewVerse,
      selectedVerse,
      translation,
      interlinearOn,
      interlinearText,
    ]
  )

  useEffect(() => {
    useBroadcastStore
      .getState()
      .setInterlinearText(interlinearOn ? interlinearText : null)
  }, [interlinearOn, interlinearText])

  const showWeb = liveWeb !== null
  const showMedia = !showWeb && liveMedia !== null
  const showSlide = !showWeb && !showMedia && liveSlide !== null
  const showVideoMonitor =
    showMedia &&
    (liveMedia.mediaType === "video" || liveMedia.mediaType === "audio")
  const showWebMonitor = showWeb

  return (
    <div
      data-slot="preview-panel"
      aria-label={t("preview.badge")}
      className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-primary/40 bg-card ring-1 ring-primary/10"
    >
      <PanelHeader
        className="border-primary/25 bg-primary/[0.04]"
        actionsClassName="w-full"
      >
        <div className="flex items-center gap-1.5">
          <span className="rounded-sm border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-[0.14em] text-primary uppercase">
            {t("preview.badge")}
          </span>
          {isLive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                takeToLiveOrPrompt(() => {
                  useBroadcastStore.getState().takeToLive()
                })
              }
              disabled={!previewPending}
              title={t("preview.takeLive")}
              className="h-6 gap-1 px-2 text-[0.625rem] font-semibold tracking-wider text-emerald-400 uppercase hover:text-emerald-300 disabled:text-muted-foreground"
            >
              <PlayIcon className="size-3.5" />
              {t("preview.goLive")}
            </Button>
          )}
          {showWeb && (
            <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
              <GlobeIcon className="size-3" />
              <span className="max-w-[120px] truncate">
                {liveWeb.isYouTube ? t("liveWeb.youtube") : t("liveWeb.web")}
              </span>
            </span>
          )}
          {(showVideoMonitor || showWebMonitor) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMonitorAudio((v) => !v)}
              title={
                monitorAudio
                  ? t("preview.muteMonitorAudio")
                  : t("preview.monitorAudio")
              }
              className={cn(monitorAudio && "text-blue-400")}
            >
              {monitorAudio ? (
                <Volume2Icon className="size-3.5" />
              ) : (
                <VolumeOffIcon className="size-3.5" />
              )}
            </Button>
          )}
        </div>
        {!showMedia && !showWeb && selectedVerse && lexiconEnabled && (
          <Button
            variant="ghost"
            size="sm"
            className={`ml-auto h-6 px-2 text-[0.625rem] font-medium tracking-wider uppercase ${
              interlinearOn
                ? "bg-blue-500/20 text-blue-400"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={toggleInterlinear}
            title={t("preview.interlinearToggle", {
              language: t(
                isNT
                  ? "preview.interlinearGreek"
                  : "preview.interlinearHebrew"
              ),
            })}
          >
            {t(
              isNT
                ? "preview.interlinearGreekShort"
                : "preview.interlinearHebrewShort"
            )}
          </Button>
        )}
      </PanelHeader>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-3 ring-1 ring-inset ring-primary/20">
        {showWeb ? (
          <PreviewWebMonitor web={liveWeb} monitorAudio={monitorAudio} />
        ) : showMedia ? (
          <MediaPreview media={liveMedia} monitorAudio={monitorAudio} />
        ) : showSlide ? (
          <SlideCanvas slide={liveSlide} />
        ) : (
          // Scripture preview through the slide path (RF3c) — matches the audience output.
          <ScripturePreview
            themeId={activeThemeId}
            verse={verseData}
            verseAutoFit={mainOutput?.verseAutoFit ?? true}
            maxVerseScale={mainOutput?.maxVerseScale ?? 1.5}
            minVerseFontSize={mainOutput?.minVerseFontSize ?? 40}
          />
        )}
      </div>
    </div>
  )
}
