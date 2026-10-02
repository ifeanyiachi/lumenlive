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
import { CastIcon, RefreshCwIcon, Trash2Icon, LinkIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { requireFeature } from "@/components/entitlements/require-feature"
import { isTauri } from "@/services/tauri-env"
import { monitorLabel, primaryMonitorIndex } from "@/lib/broadcast/monitors"
import type { Monitor } from "@/services/broadcast-window-gateway"
import type {
  OutputController,
  OutputType,
} from "@/hooks/use-output-controller"
import type {
  BroadcastOutput,
  LayerFilter,
  NdiAlphaMode,
  NdiFrameRate,
  NdiResolution,
  StageDisplayConfig,
} from "@/types"
import { OutputDisplaySettings } from "./output-display-settings"
import { StageConfigPanel } from "./output-manager/stage-config-panel"

const NDI_RESOLUTION_OPTIONS: Array<{ value: NdiResolution; label: string }> = [
  { value: "r1080p", label: "1080p (1920×1080)" },
  { value: "r720p", label: "720p (1280×720)" },
  { value: "r4k", label: "4K (3840×2160)" },
]
const NDI_FRAME_RATE_OPTIONS: Array<{ value: NdiFrameRate; label: string }> = [
  { value: "fps24", label: "24 fps" },
  { value: "fps30", label: "30 fps" },
  { value: "fps60", label: "60 fps" },
]

const LAYER_KEYS: Array<keyof LayerFilter> = [
  "showContent",
  "showProps",
  "showAlerts",
  "showCountdowns",
  "showMediaLayer",
]
const LAYER_LABEL_KEY: Record<keyof LayerFilter, string> = {
  showContent: "contentLayer",
  showProps: "propsLayer",
  showAlerts: "alertsLayer",
  showCountdowns: "countdownsLayer",
  showMediaLayer: "mediaLayer",
}

export interface OutputDetailProps {
  output: BroadcastOutput
  /** Present only for the built-in Main/Alt outputs (drives their choreography). */
  controller?: OutputController
  themes: Array<{ id: string; name: string }>
  outputs: BroadcastOutput[]
  monitors: Monitor[]
  refreshing: boolean
  onRefreshMonitors: () => void
  // Extra-output handlers (used when there is no controller):
  onToggleEnabled: (output: BroadcastOutput, enabled: boolean) => void
  onThemeChange: (outputId: string, themeId: string) => void
  onOutputTypeChange: (outputId: string, outputType: OutputType) => void
  onNdiConfigChange: (
    outputId: string,
    updates: Partial<NonNullable<BroadcastOutput["ndi"]>>
  ) => void
  onNameChange: (outputId: string, name: string) => void
  onMonitorChange: (output: BroadcastOutput, value: string) => void
  onRoutingChange: (outputId: string, type: string) => void
  onMirrorSourceChange: (outputId: string, sourceOutputId: string) => void
  onLayerToggle: (
    output: BroadcastOutput,
    layer: keyof LayerFilter,
    value: boolean
  ) => void
  onUpdateStageConfig: (
    outputId: string,
    updates: Partial<StageDisplayConfig>
  ) => void
  onRemove: (outputId: string) => void
  wouldCoverOperator: (output: BroadcastOutput) => boolean
}

/**
 * One output's full configuration, rendered in the Outputs sidebar detail pane —
 * the single surface for Main/Alt (via an injected {@link OutputController}) and for
 * added Program/Stage outputs (via store handlers). Program vs Stage is fixed at
 * creation, so there is no mode toggle here; Main/Alt carry no content routing, and
 * NDI is offered only for the built-in outputs for now (disabled for extras).
 */
export function OutputDetail({
  output,
  controller: c,
  themes,
  outputs,
  monitors,
  refreshing,
  onRefreshMonitors,
  onToggleEnabled,
  onThemeChange,
  onOutputTypeChange,
  onNdiConfigChange,
  onNameChange,
  onMonitorChange,
  onRoutingChange,
  onMirrorSourceChange,
  onLayerToggle,
  onUpdateStageConfig,
  onRemove,
  wouldCoverOperator,
}: OutputDetailProps) {
  const { t } = useTranslation("broadcast-output")
  const { t: tb } = useTranslation("broadcast")
  const isBuiltin = !!c
  const isStage = !isBuiltin && output.mode === "stage"
  const primaryIndex = primaryMonitorIndex(monitors)

  const themeId = c?.themeId ?? output.themeId
  const outputType = c?.outputType ?? output.outputType ?? "display"
  const enabled = c?.enabled ?? output.enabled
  const awaiting = c?.awaitingDisplay ?? output.awaitingDisplay ?? false

  const enableDisabled = c
    ? c.displayOnOperatorScreen && !c.enabled
    : wouldCoverOperator(output) && !output.enabled

  const setTheme = (v: string) =>
    c ? c.setTheme(v) : onThemeChange(output.id, v)
  const toggleEnabled = (v: boolean) => {
    const action = () =>
      c ? void c.toggle(v) : onToggleEnabled(output, v)
    if (!c && outputType === "ndi" && v) {
      if (!requireFeature("ndi_output", "NDI output", action)) return
    }
    action()
  }

  const ndiConfig = c
    ? {
        sourceName: c.ndiSourceName,
        resolution: c.ndiResolution,
        frameRate: c.ndiFrameRate,
        alphaMode: c.ndiAlphaMode,
      }
    : (output.ndi ?? {
        sourceName: `LumenLive ${output.name}`,
        resolution: "r1080p" as NdiResolution,
        frameRate: "fps30" as NdiFrameRate,
        alphaMode: "straightAlpha" as NdiAlphaMode,
      })
  const ndiActive = c?.ndiActive ?? (outputType === "ndi" && enabled)

  const setNdiConfig = (
    updates: Partial<NonNullable<BroadcastOutput["ndi"]>>
  ) => {
    if (c) {
      if (updates.sourceName !== undefined) c.setNdiSourceName(updates.sourceName)
      if (updates.resolution !== undefined) c.setNdiResolution(updates.resolution)
      if (updates.frameRate !== undefined) c.setNdiFrameRate(updates.frameRate)
      if (updates.alphaMode !== undefined) c.setNdiAlphaMode(updates.alphaMode)
    } else {
      onNdiConfigChange(output.id, updates)
    }
  }

  const ndiAlphaOptions: Array<{ value: NdiAlphaMode; label: string }> = [
    { value: "noneOpaque", label: t("solidBackground") },
    { value: "straightAlpha", label: t("transparentBackground") },
  ]

  const monitorField = (
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
          <RefreshCwIcon className={cn("size-3", refreshing && "animate-spin")} />
          {t("refresh")}
        </Button>
      </div>
      <Select
        value={
          c
            ? c.selectedMonitor
            : output.monitor != null
              ? String(output.monitor)
              : ""
        }
        onValueChange={(v) =>
          c ? c.setSelectedMonitor(v) : onMonitorChange(output, v)
        }
        disabled={monitors.length === 0}
      >
        <SelectTrigger className="w-full" disabled={monitors.length === 0}>
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
        <SelectContent position="popper" align="end" sideOffset={4}>
          {monitors.map((m, i) => (
            <SelectItem key={i} value={String(i)}>
              {monitorLabel(m, i, primaryIndex)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header: name + status + enable + delete */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          {isBuiltin ? (
            <div className="text-lg font-semibold">{output.name}</div>
          ) : (
            <Input
              value={output.name}
              onChange={(e) => onNameChange(output.id, e.target.value)}
              aria-label={tb("outputName")}
              className="h-9 max-w-[16rem] border-transparent bg-transparent px-2 text-lg font-semibold hover:border-border focus:border-border"
            />
          )}
          <div className="text-xs text-muted-foreground">
            {isStage ? tb("stage") : t("configureOutput")}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {awaiting && (
            <span className="text-xs text-amber-500">
              {isBuiltin ? t("reconnecting") : tb("waitingForDisplay")}
            </span>
          )}
          <span
            className={cn(
              "text-xs",
              enabled ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {enabled ? t("on") : t("off")}
          </span>
          <Switch
            checked={enabled}
            disabled={enableDisabled}
            onCheckedChange={toggleEnabled}
          />
          {!isBuiltin && (
            <Button
              variant="ghost"
              size="xs"
              className="size-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(output.id)}
              aria-label={tb("delete")}
            >
              <Trash2Icon className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Row 1: theme · output type · target/source */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{t("theme")}</label>
          <Select value={themeId} onValueChange={setTheme}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themes.map((th) => (
                <SelectItem key={th.id} value={th.id}>
                  {th.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isStage && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("outputType")}
            </label>
            <Select
              value={outputType}
              onValueChange={(v) => {
                const next = v as OutputType
                if (c) c.setOutputType(next)
                else onOutputTypeChange(output.id, next)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="display">{t("externalDisplay")}</SelectItem>
                <SelectItem value="ndi">
                  NDI
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Third cell: source name when NDI (built-in), else target monitor */}
        {outputType === "ndi" ? (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t("sourceName")}
            </label>
            <Input
              value={ndiConfig.sourceName}
              onChange={(e) => setNdiConfig({ sourceName: e.target.value })}
            />
          </div>
        ) : (
          monitorField
        )}
      </div>

      {/* Display-target warnings */}
      {outputType === "display" && (
        <>
          {!isTauri && (
            <p className="text-[0.625rem] text-muted-foreground">
              {t("displayUnavailable")}
            </p>
          )}
          {(c ? c.displayOnOperatorScreen : wouldCoverOperator(output)) && (
            <p className="text-xs text-amber-500">{t("operatorScreenWarning")}</p>
          )}
        </>
      )}

      {/* NDI feed block (built-in + NDI only) */}
      {outputType === "ndi" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                {t("resolution")}
              </label>
              <Select
                value={ndiConfig.resolution}
                onValueChange={(v) =>
                  setNdiConfig({ resolution: v as NdiResolution })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NDI_RESOLUTION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                {t("frameRate")}
              </label>
              <Select
                value={ndiConfig.frameRate}
                onValueChange={(v) =>
                  setNdiConfig({ frameRate: v as NdiFrameRate })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NDI_FRAME_RATE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs text-muted-foreground">
                {t("alphaChannel")}
              </label>
              <Select
                value={ndiConfig.alphaMode}
                onValueChange={(v) =>
                  setNdiConfig({ alphaMode: v as NdiAlphaMode })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ndiAlphaOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "w-full max-w-sm gap-1.5",
                ndiActive &&
                "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400"
            )}
            onClick={() => {
              const toggle = () => {
                if (c) void c.toggleNdi()
                else toggleEnabled(!ndiActive)
              }
              if (ndiActive || requireFeature("ndi_output", "NDI output", toggle))
                toggle()
            }}
          >
            <CastIcon className="size-3.5" />
            {ndiActive ? t("stopNdi") : t("startNdi")}
          </Button>
        </div>
      )}

      {/* Content routing — added outputs only (not Main/Alt), program mode */}
      {!isBuiltin && !isStage && (
        <div className="space-y-2.5">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <LinkIcon className="size-3" />
            {tb("contentRouting")}
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                {tb("contentRouting")}
              </label>
              <Select
                value={output.contentSource.type}
                onValueChange={(v) => onRoutingChange(output.id, v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="independent">{tb("fullProgram")}</SelectItem>
                  <SelectItem value="mirror">{tb("mirrorOutput")}</SelectItem>
                  <SelectItem value="layer-filter">{tb("layerFilter")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {output.contentSource.type === "mirror" && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {tb("mirrorSource")}
                </label>
                <Select
                  value={output.contentSource.sourceOutputId}
                  onValueChange={(v) => onMirrorSourceChange(output.id, v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tb("mirrorSource")} />
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
              </div>
            )}
          </div>

          {output.contentSource.type === "layer-filter" && (
            <div className="flex flex-wrap gap-2 pt-1">
              {LAYER_KEYS.map((key) => {
                const layers = (output.contentSource as { layers: LayerFilter })
                  .layers
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 rounded-full border border-border/60 py-1.5 pr-1.5 pl-3 text-xs"
                  >
                    <span>{tb(LAYER_LABEL_KEY[key])}</span>
                    <Switch
                      checked={layers[key]}
                      onCheckedChange={(v) => onLayerToggle(output, key, v)}
                    />
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Stage display config — added Stage outputs */}
      {isStage && (
        <StageConfigPanel
          output={output}
          onUpdate={(updates) => onUpdateStageConfig(output.id, updates)}
        />
      )}

      {/* Output size + verse text — all program outputs */}
      {!isStage && <OutputDisplaySettings output={output} />}
    </div>
  )
}
