import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
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
  useBroadcastStore,
  useAppStore,
  useUpdateStore,
  useShortcutsStore,
} from "@/stores"
import { shouldNotifyUpdate } from "@/lib/updater/version"
import { ReloadButton } from "@/components/controls/reload-button"
import { AlertTrigger } from "@/components/alerts/alert-trigger"
import { CountdownTrigger } from "@/components/countdown/countdown-trigger"
import { cn } from "@/lib/utils"
import type { AppView } from "@/stores/app-store"
import { AccountMenu } from "@/components/controls/account-menu"
import { Separator } from "@/components/ui/separator"

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

export function TransportBar() {
  const { t } = useTranslation("controls")
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const currentView = useAppStore((s) => s.view)
  // Same predicate as the Store-page banner, so dismissing there clears the dot.
  const updateAvailable = useUpdateStore((s) =>
    shouldNotifyUpdate(s.available, s.dismissedVersion)
  )
  const viewButtons = getViewButtons(t)

  return (
    <div
      data-slot="transport-bar"
      className="col-span-4 grid h-14 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-border bg-card px-3"
    >
      {/* Left: Account */}
      <div className="flex min-w-0 items-center gap-2.5 justify-self-start">
        <AccountMenu />
        <ReloadButton />
      </div>

      {/* Center: View Switcher */}
      <div
        data-tour="view-switcher"
        className="flex min-w-0 items-center gap-0.5 rounded-lg border border-border bg-muted/50 p-0.5 justify-self-center"
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

      {/* Right: service tools, design tools, and app controls */}
      <div className="flex min-w-0 items-center gap-2 justify-self-end">
        <div
          role="group"
          aria-label={t("groups.serviceTools")}
          className="flex items-center gap-1"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("broadcastSettings")}
            aria-label={t("broadcastSettings")}
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
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div
          role="group"
          aria-label={t("groups.designTools")}
          className="flex items-center gap-1"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("themeDesigner")}
            aria-label={t("themeDesigner")}
            data-tour="theme"
            onClick={() => {
              if (
                requireFeature("theme_designer", t("themeDesignerFeature"), () =>
                  useBroadcastStore.getState().setDesignerOpen(true)
                )
              )
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
            aria-label={t("stageLayoutDesigner")}
            onClick={() => {
              if (
                requireFeature("stage_display", t("stageDisplayFeature"), () =>
                  useBroadcastStore.getState().setStageDesignerOpen(true)
                )
              )
                useBroadcastStore.getState().setStageDesignerOpen(true)
            }}
          >
            <MonitorIcon className="size-3.5" />
          </Button>
          <StageLayoutDesigner />
        </div>

        <Separator orientation="vertical" className="h-5" />

        <div
          role="group"
          aria-label={t("groups.appControls")}
          className="flex items-center gap-1"
        >
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
    </div>
  )
}
