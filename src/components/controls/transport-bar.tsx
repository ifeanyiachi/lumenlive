import { useState } from "react"
import { useTranslation } from "react-i18next"
import { LevelMeter } from "@/components/ui/level-meter"
import { LiveIndicator } from "@/components/ui/live-indicator"
import { Badge } from "@/components/ui/badge"
import {
  MicIcon,
  PaletteIcon,
  MonitorIcon,
  CastIcon,
  RadioIcon,
  PresentationIcon,
  ImageIcon,
  MusicIcon,
  PlayIcon,
  StoreIcon,
  KeyboardIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsDialog } from "@/components/settings-dialog"
import { ThemeDesigner } from "@/components/broadcast/theme-designer"
import { PresentationEditorHost } from "@/components/slides/presentation-editor-host"
import { StageLayoutDesigner } from "@/components/broadcast/stage-layout/stage-layout-designer"
import { requireFeature } from "@/components/entitlements/require-feature"
import { BroadcastSettings } from "@/components/broadcast/broadcast-settings"
import {
  useAudioStore,
  useTranscriptStore,
  useBroadcastStore,
  useAppStore,
  useUpdateStore,
  useShortcutsStore,
} from "@/stores"
import { shouldNotifyUpdate } from "@/lib/updater/version"
import { ReloadButton } from "@/components/controls/reload-button"
import { AlertTrigger } from "@/components/alerts/alert-trigger"
import { CountdownTrigger } from "@/components/countdown/countdown-trigger"
import { useEntitlementsStore } from "@/stores/entitlements-store"
import { planLabel } from "@/lib/entitlements"
import { cn } from "@/lib/utils"
import type { AppView } from "@/stores/app-store"

function getViewButtons(t: (key: string) => string): {
  view: AppView
  label: string
  icon: React.ReactNode
}[] {
  return [
    {
      view: "live",
      label: t("views.live"),
      icon: <RadioIcon className="size-3.5" />,
    },
    {
      view: "slide",
      label: t("views.slides"),
      icon: <PresentationIcon className="size-3.5" />,
    },
    {
      view: "media",
      label: t("views.media"),
      icon: <ImageIcon className="size-3.5" />,
    },
    {
      view: "song",
      label: t("views.songs"),
      icon: <MusicIcon className="size-3.5" />,
    },
    {
      view: "youtube",
      label: t("views.youtube"),
      icon: <PlayIcon className="size-3.5" />,
    },
    {
      view: "store",
      label: t("views.store"),
      icon: <StoreIcon className="size-3.5" />,
    },
  ]
}

/**
 * Leaf that subscribes to the audio RMS only. Isolated so the high-frequency
 * `audio_level` tick (many times per second during recording) re-renders this
 * meter alone, never the whole transport bar. (Mirrors `AudioLevelMeter` in
 * `transcript-panel.tsx`.)
 */
function AudioLevelMeter() {
  const rms = useAudioStore((s) => s.level.rms)
  return <LevelMeter level={rms} bars={4} />
}

export function TransportBar() {
  const { t } = useTranslation("controls")
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const currentView = useAppStore((s) => s.view)
  // Same predicate as the Store-page banner, so dismissing there clears the dot.
  const updateAvailable = useUpdateStore((s) =>
    shouldNotifyUpdate(s.available, s.dismissedVersion)
  )
  // Current plan label — built-in and admin-managed tier names are both
  // derived from the verified entitlement snapshot.
  const plan = useEntitlementsStore((s) => planLabel(s.entitlement))
  const viewButtons = getViewButtons(t)

  return (
    <div
      data-slot="transport-bar"
      className="col-span-4 flex h-14 items-center justify-between border-b border-border bg-card px-3"
    >
      {/* Left: Wordmark + Plan Badge */}
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          LumenLive
        </span>
        <Badge
          variant={plan === "Free" ? "outline" : "default"}
          className="text-[0.5625rem] uppercase"
        >
          {plan}
        </Badge>
        <ReloadButton />
      </div>

      {/* Center: View Switcher */}
      <div
        data-tour="view-switcher"
        className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5"
      >
        {viewButtons.map(({ view, label, icon }) => (
          <Button
            key={view}
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
              currentView === view
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => useAppStore.getState().setView(view)}
          >
            {icon}
            {label}
            {view === "store" && updateAvailable && (
              <span
                className="size-1.5 rounded-full bg-red-500"
                aria-label={t("updateAvailable")}
              />
            )}
          </Button>
        ))}
      </div>

      {/* Right: Audio + Status + Settings */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <MicIcon className="size-3.5 text-muted-foreground" />
          <AudioLevelMeter />
        </div>
        <LiveIndicator active={isTranscribing} />
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("broadcastSettings")}
          data-tour="broadcast"
          onClick={() => setBroadcastOpen(true)}
        >
          <CastIcon className="size-3.5" />
        </Button>
        <BroadcastSettings
          open={broadcastOpen}
          onOpenChange={setBroadcastOpen}
        />
        <AlertTrigger />
        <CountdownTrigger />
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("themeDesigner")}
          data-tour="theme"
          onClick={() => {
            if (requireFeature("theme_designer", t("themeDesignerFeature")))
              useBroadcastStore.getState().setDesignerOpen(true)
          }}
        >
          <PaletteIcon className="size-3.5" />
        </Button>
        <ThemeDesigner />
        <PresentationEditorHost />
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("stageLayoutDesigner")}
          onClick={() => {
            if (requireFeature("stage_display", t("stageDisplayFeature")))
              useBroadcastStore.getState().setStageDesignerOpen(true)
          }}
        >
          <MonitorIcon className="size-3.5" />
        </Button>
        <StageLayoutDesigner />
        <SettingsDialog />
        <Button
          variant="ghost"
          size="icon-sm"
          title={t("keyboardShortcuts")}
          aria-label={t("keyboardShortcuts")}
          onClick={() => useShortcutsStore.getState().setOverlayOpen(true)}
        >
          <KeyboardIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
