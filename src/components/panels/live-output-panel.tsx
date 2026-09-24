import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { PanelHeader } from "@/components/ui/panel-header"
import { ScripturePreview } from "@/components/ui/scripture-preview"
import { BasePreview } from "@/components/ui/base-preview"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { isEditableTarget } from "@/lib/dom/is-editable-target"
import { useBroadcastStore, useBibleStore, useQueueStore } from "@/stores"
import { findOutput } from "@/lib/broadcast/output-selectors"
import {
  BROADCAST_EVENTS,
  type WebProgressPayload,
} from "@/services/broadcast-content-gateway"
import { OverlayCanvas } from "@/components/broadcast/overlay-canvas"
import {
  toVerseRenderData,
  presentQueueVerse,
  takeToLiveOrPrompt,
} from "@/hooks/use-broadcast"
import { shouldStageManualVerse } from "@/lib/broadcast/follow-manual-verse"
import { useTauriEvent } from "@/hooks/use-tauri-event"
import { SlideCanvas } from "@/components/slides/slide-canvas"
import {
  Volume2Icon,
  VolumeXIcon,
  LayersIcon,
  ImageIcon,
  MonitorOffIcon,
  EyeOffIcon,
} from "lucide-react"

import { PropsManager } from "@/components/props/props-manager"
import { requireFeature } from "@/components/entitlements/require-feature"
import { applyMuteParam } from "@/lib/live-output/presentation"
import { LiveMediaMonitor } from "@/components/panels/live-output/live-media-monitor"
import { LiveWebMonitor } from "@/components/panels/live-output/live-web-monitor"

export function LiveOutputPanel() {
  const { t } = useTranslation("panels")
  const isLive = useBroadcastStore((s) => s.isLive)
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
        previewSegments: bs.previewVerse?.segments.length ?? 1,
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
  // Space is an alias for Enter here (the media/web monitors no longer claim it);
  // ←/→ are still reserved by those monitors. Ignored while typing.
  useEffect(() => {
    if (!isLive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Enter" && e.code !== "NumpadEnter" && e.code !== "Space")
        return
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
      takeToLiveOrPrompt(() => {
        useBroadcastStore.getState().takeToLive()
      })
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
      aria-label={t("live.badge")}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card",
        isLive &&
          "border-emerald-500/70 shadow-[0_0_24px_-16px_rgba(16,185,129,0.9)] ring-1 ring-emerald-500/25"
      )}
    >
      <PanelHeader
        className={cn(
          isLive && "border-emerald-500/30 bg-emerald-500/[0.05]"
        )}
        actionsClassName="w-full"
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[0.5625rem] font-semibold tracking-[0.14em] uppercase",
              isLive
                ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
                : "border-border bg-muted/50 text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                isLive ? "animate-pulse bg-emerald-400" : "bg-muted-foreground/50"
              )}
            />
            {t("live.badge")}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              // Lower-thirds / props are a Starter capability.
              if (
                requireFeature(
                  "props",
                  "Lower-thirds & props",
                  () => setPropsOpen(true)
                )
              )
                setPropsOpen(true)
            }}
            title={t("live.props")}
          >
            <LayersIcon className="size-3.5" />
          </Button>
          <PropsManager open={propsOpen} onOpenChange={setPropsOpen} />
          {(showVideoControls || showWebControls) && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                useBroadcastStore.getState().setBroadcastMuted(!broadcastMuted)
              }
              title={
                broadcastMuted ? t("live.unmuteAudio") : t("live.muteAudio")
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
        </div>
        <label className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              "text-[0.625rem] font-medium tracking-wider uppercase transition-colors",
              isLive ? "text-emerald-400" : "text-muted-foreground"
            )}
          >
            {isLive ? t("live.live") : t("live.goLive")}
          </span>
          <Switch
            checked={isLive}
            onCheckedChange={(checked) =>
              useBroadcastStore.getState().setLive(checked)
            }
            className="data-[state=checked]:bg-emerald-500"
          />
        </label>
      </PanelHeader>

      <div
        className={cn(
          "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black p-3 transition-opacity ring-1 ring-inset",
          isLive ? "ring-emerald-400/30" : "ring-border/30",
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
        {/* Do not create a stacking context here. The video picture stays below
            the z-15 audience-overlay canvas, while LiveWebMonitor's z-20
            play/pause button can sit above it and still receive pointer input. */}
        <div className="relative flex size-full items-center justify-center">
          {showWeb ? (
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
          ) : !liveVerse && baseBackground ? (
            // Idle with a configured Clear & Idle background: show it here too
            // (image / video / solid / gradient), matching the audience idle
            // backdrop — the feature applies to idle, not just Clear.
            <BasePreview
              themeId={activeThemeId}
              baseBackground={baseBackground}
            />
          ) : (
            // Live scripture through the slide path (RF3c) — matches the audience output.
            <ScripturePreview
              themeId={activeThemeId}
              verse={liveVerse}
              verseAutoFit={mainOutput?.verseAutoFit ?? true}
              maxVerseScale={mainOutput?.maxVerseScale ?? 1.5}
              minVerseFontSize={mainOutput?.minVerseFontSize ?? 40}
            />
          )}
        </div>
        {clearForeground && (
          // Keep the live surface mounted under Clear. In particular, unmounting
          // a YouTube monitor destroys its iframe player and restarts playback
          // when text is revealed again. This mirrors Black's overlay behaviour.
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black">
            <BasePreview
              themeId={activeThemeId}
              baseBackground={baseBackground}
              className="size-full object-cover"
            />
          </div>
        )}
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
              title={t("live.previousPage")}
            >
              ‹
            </button>
            <span className="tabular-nums">
              {t("live.pageOf", {
                current: liveVersePageIndex + 1,
                total: liveVersePages.length,
              })}
            </span>
            <button
              type="button"
              disabled={liveVersePageIndex >= liveVersePages.length - 1}
              onClick={() => useBroadcastStore.getState().nextVersePage()}
              className="rounded px-1.5 py-0.5 hover:bg-white/15 disabled:opacity-30"
              title={t("live.nextPage")}
            >
              ›
            </button>
          </div>
        )}
        {mediaLayer?.active && (
          <div className="absolute right-4 bottom-4 z-20 flex items-center gap-1 rounded bg-blue-500/70 px-1.5 py-0.5">
            <ImageIcon className="size-2.5 text-white" />
            <span className="text-[0.5rem] font-medium text-white">
              {t("live.background")}
            </span>
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
                ? t("live.blackHidden")
                : showLogo
                  ? t("live.logo")
                  : t("live.clearHidden")}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
