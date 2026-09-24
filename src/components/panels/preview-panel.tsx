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
} from "lucide-react"
import { PreviewWebMonitor } from "@/components/panels/preview-web-monitor"
import { formatClock } from "@/lib/live-output/transport"

/** Read-only mirror of the live output's playback position (control lives in Live display). */
function OutputProgressMirror() {
  const transport = useBroadcastStore((s) => s.mediaTransport)
  if (!transport || !transport.duration) return null
  const pct = Math.min(100, (transport.position / transport.duration) * 100)
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-5 pb-1.5">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[0.625rem] text-white/80 tabular-nums">
        {formatClock(transport.position)} / {formatClock(transport.duration)}
      </span>
    </div>
  )
}

function MediaPreview({
  media,
  monitorAudio,
}: {
  media: LiveMedia
  monitorAudio: boolean
}) {
  const { filePath, mediaType } = media
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const src = useMemo(() => {
    try {
      return safeFileSrc(filePath)
    } catch {
      return filePath
    }
  }, [filePath])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = !monitorAudio
    }
    if (audioRef.current) {
      audioRef.current.muted = !monitorAudio
    }
  }, [monitorAudio])

  if (mediaType === "video") {
    return (
      <div className="relative flex size-full items-center justify-center overflow-hidden">
        <MediaFitBackdrop media={media} src={src} />
        {/* 16:9 output frame, letterboxed into the panel: the media fits inside
            this frame exactly as it does on the audience 1920×1080 canvas, so the
            operator sees the same crop instead of one cropped to the panel shape. */}
        <video
          ref={videoRef}
          key={filePath}
          src={src}
          autoPlay
          muted={!monitorAudio}
          playsInline
          className="relative aspect-video max-h-full max-w-full"
          style={mediaFitStyle(media)}
        />
        <OutputProgressMirror />
      </div>
    )
  }

  if (mediaType === "audio") {
    return (
      <div className="relative flex size-full flex-col items-center justify-center gap-3">
        <MusicIcon className="size-12 text-muted-foreground/50" />
        <OutputProgressMirror />
        <audio
          ref={audioRef}
          key={filePath}
          src={src}
          autoPlay
          muted={!monitorAudio}
          controls
          className="w-4/5 max-w-md"
        />
      </div>
    )
  }

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
