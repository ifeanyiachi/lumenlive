import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { Monitor } from "@/services/broadcast-window-gateway"
import type { BroadcastOutput, StageDisplayConfig } from "@/types/broadcast"
import type { Theme } from "@/types/theme"
import {
  Trash2Icon,
  MonitorIcon,
  RadioIcon,
  LayersIcon,
  LinkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  RefreshCwIcon,
} from "lucide-react"
import { StageConfigPanel } from "./stage-config-panel"
import { isManagedElsewhere, isTauri } from "./utils"
import { useTranslation } from "react-i18next"

export type OutputRowProps = {
  output: BroadcastOutput
  isExpanded: boolean
  themes: Theme[]
  outputs: BroadcastOutput[]
  monitors: Monitor[]
  refreshing: boolean
  onToggleExpand: () => void
  onToggleEnabled: (output: BroadcastOutput, enabled: boolean) => void
  onRemove: (outputId: string) => void
  onNameChange: (outputId: string, name: string) => void
  onThemeChange: (outputId: string, themeId: string) => void
  onModeChange: (outputId: string, mode: "normal" | "stage") => void
  onRefreshMonitors: () => void
  onMonitorChange: (output: BroadcastOutput, value: string) => void
  onRoutingChange: (outputId: string, routingType: string) => void
  onMirrorSourceChange: (outputId: string, sourceOutputId: string) => void
  onLayerToggle: (
    outputId: string,
    output: BroadcastOutput,
    layer: string,
    value: boolean
  ) => void
  onUpdateStageConfig: (
    outputId: string,
    updates: Partial<StageDisplayConfig>
  ) => void
  wouldCoverOperator: (output: BroadcastOutput) => boolean
  monitorLabel: (m: Monitor, i: number) => string
}

export function OutputRow({
  output,
  isExpanded,
  themes,
  outputs,
  monitors,
  refreshing,
  onToggleExpand,
  onToggleEnabled,
  onRemove,
  onNameChange,
  onThemeChange,
  onModeChange,
  onRefreshMonitors,
  onMonitorChange,
  onRoutingChange,
  onMirrorSourceChange,
  onLayerToggle,
  onUpdateStageConfig,
  wouldCoverOperator,
  monitorLabel,
}: OutputRowProps) {
  const { t } = useTranslation("broadcast")
  const isMain = output.id === "main"

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header row */}
      <div className="flex items-center gap-3 p-3">
        <button
          onClick={onToggleExpand}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {output.mode === "stage" ? (
            <MonitorIcon className="size-4 shrink-0 text-purple-400" />
          ) : (
            <RadioIcon className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">{output.name}</span>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium",
              output.mode === "stage"
                ? "bg-purple-500/15 text-purple-400"
                : "bg-muted text-muted-foreground"
            )}
          >
            {output.mode === "stage" ? t("stage") : t("program")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {output.enabled && output.awaitingDisplay && (
            <span className="text-xs text-amber-500">
              {t("waitingForDisplay")}
            </span>
          )}
          <span
            className={cn(
              "text-xs",
              output.enabled ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {output.enabled ? t("on") : t("off")}
          </span>
          <Switch
            checked={output.enabled}
            disabled={
              !isManagedElsewhere(output.id) &&
              !output.enabled &&
              wouldCoverOperator(output)
            }
            onCheckedChange={(v) => onToggleEnabled(output, v)}
          />
          {!isMain && (
            <Button
              variant="ghost"
              size="xs"
              className="size-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(output.id)}
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Expanded settings */}
      {isExpanded && (
        <div className="space-y-3 border-t border-border p-3">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("name")}</label>
            <Input
              value={output.name}
              onChange={(e) => onNameChange(output.id, e.target.value)}
              placeholder={t("outputName")}
            />
          </div>

          {/* Theme */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("theme")}</label>
            <Select
              value={output.themeId}
              onValueChange={(v) => onThemeChange(output.id, v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {themes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{t("mode")}</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onModeChange(output.id, "normal")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                  output.mode === "normal"
                    ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <RadioIcon className="size-3.5" />
                {t("program")}
              </button>
              <button
                onClick={() => onModeChange(output.id, "stage")}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                  output.mode === "stage"
                    ? "border-purple-500/50 bg-purple-500/15 text-purple-400"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                <MonitorIcon className="size-3.5" />
                {t("stage")}
              </button>
            </div>
          </div>

          {/* Target monitor — extra outputs are activated here, so
              they carry their own monitor picker. main/alt are opened
              from Broadcast Settings and manage their monitor there. */}
          {!isManagedElsewhere(output.id) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">
                  {t("targetMonitor")}
                </label>
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={refreshing}
                  onClick={onRefreshMonitors}
                  className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground"
                >
                  <RefreshCwIcon
                    className={cn("size-3", refreshing && "animate-spin")}
                  />
                  {t("refresh")}
                </Button>
              </div>
              <Select
                value={output.monitor != null ? String(output.monitor) : ""}
                onValueChange={(v) => onMonitorChange(output, v)}
                disabled={monitors.length === 0}
              >
                <SelectTrigger
                  className="w-full"
                  disabled={monitors.length === 0}
                >
                  <SelectValue
                    placeholder={
                      !isTauri
                        ? t("desktopAppRequired")
                        : monitors.length === 0
                          ? t("noMonitorsDetected")
                          : t("selectMonitor")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {monitors.map((m, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {monitorLabel(m, i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isTauri && (
                <p className="text-[0.625rem] text-muted-foreground">
                  Display output is only available in the LumenLive desktop app.
                </p>
              )}
              {wouldCoverOperator(output) && (
                <p className="text-[0.625rem] text-amber-500">
                  This is your control screen — output stays off so it won't
                  cover your workspace (you couldn't close it). Connect a second
                  display to send output there, or use NDI.
                </p>
              )}
            </div>
          )}

          {/* Stage Display Config */}
          {output.mode === "stage" && (
            <StageConfigPanel
              output={output}
              onUpdate={(updates) => onUpdateStageConfig(output.id, updates)}
            />
          )}

          {/* Content Routing */}
          {output.mode !== "stage" && (
            <div className="space-y-1.5">
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <LinkIcon className="size-3" />
                {t("contentRouting")}
              </label>
              <Select
                value={output.contentSource.type}
                onValueChange={(v) => onRoutingChange(output.id, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">{t("fullProgram")}</SelectItem>
                  <SelectItem value="mirror">{t("mirrorOutput")}</SelectItem>
                  <SelectItem value="layer-filter">{t("layerFilter")}</SelectItem>
                </SelectContent>
              </Select>

              {/* Mirror source selector */}
              {output.contentSource.type === "mirror" && (
                <Select
                  value={output.contentSource.sourceOutputId}
                  onValueChange={(v) => onMirrorSourceChange(output.id, v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("mirrorSource")} />
                  </SelectTrigger>
                  <SelectContent>
                    {outputs
                      .filter((o) => o.id !== output.id)
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {/* Layer filter toggles */}
              {output.contentSource.type === "layer-filter" && (
                <div className="space-y-2 rounded-md border border-border p-2.5">
                  <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <LayersIcon className="size-3" />
                    {t("visibleLayers")}
                  </div>
                  {(
                    [
                      ["showContent", t("contentLayer")],
                      ["showProps", t("propsLayer")],
                      ["showAlerts", t("alertsLayer")],
                      ["showCountdowns", t("countdownsLayer")],
                      ["showMediaLayer", t("mediaLayer")],
                    ] as const
                  ).map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center justify-between text-xs"
                    >
                      <span>{label}</span>
                      <Switch
                        checked={
                          output.contentSource.type === "layer-filter"
                            ? output.contentSource.layers[key]
                            : true
                        }
                        onCheckedChange={(v) =>
                          onLayerToggle(output.id, output, key, v)
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
