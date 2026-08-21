import { useEffect, useMemo, useRef, useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { PanelHeader } from "@/components/ui/panel-header"
import { ScripturePreview } from "@/components/ui/scripture-preview"
import { BasePreview } from "@/components/ui/base-preview"
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
  type WebProgressPayload,
} from "@/services/broadcast-content-gateway"
import { OverlayCanvas } from "@/components/broadcast/overlay-canvas"
import { toVerseRenderData, presentQueueVerse } from "@/hooks/use-broadcast"
import { focusBroadcastWindow } from "@/services/broadcast-window-gateway"
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
  SlidersHorizontalIcon,
  ChevronDownIcon,
  MonitorUpIcon,
} from "lucide-react"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
import { PropsManager } from "@/components/props/props-manager"
import { applyMuteParam } from "@/lib/live-output/presentation"
import { LiveMediaMonitor } from "@/components/panels/live-output/live-media-monitor"
import { LiveWebMonitor } from "@/components/panels/live-output/live-web-monitor"

export function LiveOutputPanel() {
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
            // Clear reveals the central base backdrop (no content) — consistent
            // across verse / slide / song, mirroring the audience output (RF3c).
            <BasePreview themeId={activeThemeId} baseBackground={baseBackground} />
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
          ) : !liveVerse && baseBackground ? (
            // Idle with a configured Clear & Idle background: show it here too
            // (image / video / solid / gradient), matching the audience idle
            // backdrop — the feature applies to idle, not just Clear.
            <BasePreview themeId={activeThemeId} baseBackground={baseBackground} />
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
