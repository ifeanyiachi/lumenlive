import { useState } from "react"
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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsDialog } from "@/components/settings-dialog"
import { ThemeDesigner } from "@/components/broadcast/theme-designer"
import { PresentationEditorHost } from "@/components/slides/presentation-editor-host"
import { StageLayoutDesigner } from "@/components/broadcast/stage-layout/stage-layout-designer"
import { BroadcastSettings } from "@/components/broadcast/broadcast-settings"
import {
  useAudioStore,
  useTranscriptStore,
  useBroadcastStore,
  useAppStore,
  useUpdateStore,
} from "@/stores"
import { shouldNotifyUpdate } from "@/lib/updater/version"
import { AlertTrigger } from "@/components/alerts/alert-trigger"
import { CountdownTrigger } from "@/components/countdown/countdown-trigger"
import { cn } from "@/lib/utils"
import type { AppView } from "@/stores/app-store"

const VIEW_BUTTONS: { view: AppView; label: string; icon: React.ReactNode }[] =
  [
    { view: "live", label: "Live", icon: <RadioIcon className="size-3.5" /> },
    {
      view: "slide",
      label: "Slides",
      icon: <PresentationIcon className="size-3.5" />,
    },
    { view: "media", label: "Media", icon: <ImageIcon className="size-3.5" /> },
    { view: "song", label: "Songs", icon: <MusicIcon className="size-3.5" /> },
    {
      view: "youtube",
      label: "YouTube",
      icon: <PlayIcon className="size-3.5" />,
    },
    { view: "store", label: "Store", icon: <StoreIcon className="size-3.5" /> },
  ]

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
  const isTranscribing = useTranscriptStore((s) => s.isTranscribing)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const currentView = useAppStore((s) => s.view)
  // Same predicate as the Store-page banner, so dismissing there clears the dot.
  const updateAvailable = useUpdateStore((s) =>
    shouldNotifyUpdate(s.available, s.dismissedVersion)
  )

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
        <Badge variant="outline" className="text-[0.5625rem] uppercase">
          Free
        </Badge>
      </div>

      {/* Center: View Switcher */}
      <div
        data-tour="view-switcher"
        className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5"
      >
        {VIEW_BUTTONS.map(({ view, label, icon }) => (
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
                aria-label="Update available"
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
          title="Broadcast Settings"
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
          title="Theme Designer"
          data-tour="theme"
          onClick={() => useBroadcastStore.getState().setDesignerOpen(true)}
        >
          <PaletteIcon className="size-3.5" />
        </Button>
        <ThemeDesigner />
        <PresentationEditorHost />
        <Button
          variant="ghost"
          size="icon-sm"
          title="Stage Layout Designer"
          onClick={() =>
            useBroadcastStore.getState().setStageDesignerOpen(true)
          }
        >
          <MonitorIcon className="size-3.5" />
        </Button>
        <StageLayoutDesigner />
        <SettingsDialog />
      </div>
    </div>
  )
}
