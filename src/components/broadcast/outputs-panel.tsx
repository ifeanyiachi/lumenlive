import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  MonitorIcon,
  CastIcon,
  PlusIcon,
  ChevronDownIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
  listMonitors,
  closeBroadcastWindow,
  ensureBroadcastWindow,
  onOutputReady,
  requestOutputResync,
  type Monitor,
} from "@/services/broadcast-window-gateway"
import { emitNdiConfig, startNdi, stopNdi } from "@/services/ndi-gateway"
import { isTauri } from "@/services/tauri-env"
import { activateExtraOutput } from "@/hooks/use-awaiting-display-resume"
import {
  operatorScreenIndex,
  resolveOutputMonitorIndex,
  monitorFingerprint,
} from "@/lib/broadcast/monitors"
import { routingFromType, toggleLayer } from "@/lib/broadcast/content-routing"
import { useOutputController } from "@/hooks/use-output-controller"
import { useBroadcastStore, useSettingsStore, useCountdownStore } from "@/stores"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { BroadcastOutput, LayerFilter } from "@/types"
import { OutputDetail } from "./output-detail"
import type { NdiAlphaMode, NdiFrameRate, NdiResolution } from "@/types"

/**
 * The "Outputs" tab of Broadcast Settings: a sidebar list of every output (Main,
 * Alternate, then any added Program/Stage outputs) beside a detail pane. Folds in
 * the former Output Manager modal — add / rename / remove / route all happen here.
 *
 * Main and Alternate keep their proven activation choreography via
 * {@link useOutputController}; added outputs are driven through the store +
 * {@link activateExtraOutput} (the shared fail-safe activator).
 */
export function OutputsPanel({ open }: { open: boolean }) {
  const { t } = useTranslation("broadcast")

  const customThemes = useThemesStore((s) => s.customThemes)
  const themes = useMemo(
    () => buildThemeRegistry(customThemes).filter((th) => th.type === "scripture"),
    [customThemes]
  )

  const outputs = useBroadcastStore((s) => s.outputs)
  const addOutput = useBroadcastStore((s) => s.addOutput)
  const removeOutput = useBroadcastStore((s) => s.removeOutput)
  const updateOutput = useBroadcastStore((s) => s.updateOutput)
  const updateStageConfig = useBroadcastStore((s) => s.updateStageConfig)

  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [selectedId, setSelectedId] = useState("main")

  const mainCtrl = useOutputController({
    outputId: "main",
    open,
    monitors,
    defaultOutputType: "display",
    defaultNdiSourceName: "LumenLive Output",
  })
  const altCtrl = useOutputController({
    outputId: "alt",
    open,
    monitors,
    defaultOutputType: "display",
    defaultNdiSourceName: "LumenLive Alt",
  })

  const defaultNdiConfig = (output: BroadcastOutput) =>
    output.ndi ?? {
      sourceName: `LumenLive ${output.name}`,
      resolution: "r1080p" as NdiResolution,
      frameRate: "fps30" as NdiFrameRate,
      alphaMode: "straightAlpha" as NdiAlphaMode,
    }

  const fetchMonitors = useCallback(async () => {
    if (!isTauri) {
      setMonitors([])
      return
    }
    setRefreshing(true)
    try {
      setMonitors(await listMonitors())
    } catch {
      setMonitors([])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void fetchMonitors()
  }, [open, fetchMonitors])

  // When any output window announces ready, re-push all content + each built-in
  // output's NDI config so a just-opened window isn't blank (unchanged from the
  // former broadcast-settings effect).
  const pushMainNdi = mainCtrl.pushNdiConfig
  const pushAltNdi = altCtrl.pushNdiConfig
  useEffect(() => {
    if (!open) return
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const unlistenPromise = onOutputReady(() => {
      useBroadcastStore.getState().syncBroadcastOutput()
      useCountdownStore.getState().resyncOutputs()
      pushMainNdi()
      pushAltNdi()
      timeoutId = setTimeout(() => {
        useBroadcastStore.getState().syncBroadcastOutput()
      }, 150)
    })
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [open, pushMainNdi, pushAltNdi])

  // Open an extra output via the shared fail-safe activator, toasting a held hold.
  const activateOutput = useCallback(
    async (output: BroadcastOutput) => {
      const result = await activateExtraOutput(output.id, monitors)
      if (result === "absent") {
        toast.warning(t("displayNotConnected", { name: output.name }))
      }
    },
    [monitors, t]
  )

  const wouldCoverOperator = useCallback(
    (output: BroadcastOutput): boolean => {
      if (!isTauri || monitors.length === 0) return false
      const monitor = resolveOutputMonitorIndex(
        output.monitorTarget,
        output.monitor,
        monitors
      )
      return monitor === operatorScreenIndex(monitors)
    },
    [monitors]
  )

  const handleAddOutput = (kind: "program" | "stage") => {
    const output: BroadcastOutput = {
      id: crypto.randomUUID().slice(0, 8),
      name: t("outputNumber", { number: outputs.length + 1 }),
      themeId:
        useSettingsStore.getState().scriptureDefaultThemeId ||
        themes[0]?.id ||
        "",
      mode: kind === "stage" ? "stage" : "normal",
      outputType: "display",
      contentSource: { type: "mirror", sourceOutputId: "main" },
      enabled: false,
    }
    addOutput(output)
    setSelectedId(output.id)
  }

  const handleRemoveOutput = async (outputId: string) => {
    await closeBroadcastWindow(outputId).catch(() => {})
    removeOutput(outputId)
    if (selectedId === outputId) setSelectedId("main")
  }

  const handleToggleEnabled = (output: BroadcastOutput, enabled: boolean) => {
    if (output.outputType === "ndi") {
      const config = defaultNdiConfig(output)
      if (!enabled) {
        void stopNdi(output.id).catch(() => {})
        void emitNdiConfig(output.id, {
          active: false,
          fps: config.frameRate === "fps60" ? 60 : config.frameRate === "fps24" ? 24 : 30,
          width: config.resolution === "r4k" ? 3840 : config.resolution === "r720p" ? 1280 : 1920,
          height: config.resolution === "r4k" ? 2160 : config.resolution === "r720p" ? 720 : 1080,
          alphaMode: config.alphaMode,
        }).catch(() => {})
        updateOutput(output.id, { enabled: false, awaitingDisplay: false })
        void closeBroadcastWindow(output.id).catch(() => {})
        return
      }

      void (async () => {
        try {
          await ensureBroadcastWindow(
            output.id,
            output.mode === "stage" ? "stage" : undefined
          )
          const session = await startNdi(output.id, config)
          updateOutput(output.id, {
            enabled: true,
            awaitingDisplay: false,
            ndi: {
              sourceName: session.sourceName,
              resolution: session.resolution,
              frameRate: session.frameRate,
              alphaMode: session.alphaMode,
            },
          })
          void emitNdiConfig(output.id, {
            active: true,
            fps: session.fps,
            width: session.width,
            height: session.height,
            alphaMode: session.alphaMode,
          }).catch(() => {})
          void requestOutputResync(output.id).catch(() => {})
          useBroadcastStore.getState().syncBroadcastOutputFor(output.id)
        } catch {
          updateOutput(output.id, { enabled: false })
        }
      })()
      return
    }

    if (!enabled) {
      updateOutput(output.id, { enabled: false, awaitingDisplay: false })
      void closeBroadcastWindow(output.id).catch(() => {})
      return
    }
    void activateOutput(output)
  }

  const handleOutputTypeChange = (
    outputId: string,
    outputType: "display" | "ndi"
  ) => {
    const output = outputs.find((item) => item.id === outputId)
    if (!output) return
    updateOutput(outputId, {
      outputType,
      ...(outputType === "ndi" ? { ndi: defaultNdiConfig(output) } : {}),
    })
  }

  const handleNdiConfigChange = (
    outputId: string,
    updates: Partial<NonNullable<BroadcastOutput["ndi"]>>
  ) => {
    const output = outputs.find((item) => item.id === outputId)
    if (!output) return
    updateOutput(outputId, {
      ndi: { ...defaultNdiConfig(output), ...updates },
    })
  }

  const handleMonitorChange = (output: BroadcastOutput, value: string) => {
    const monitor = Number(value)
    const monitorTarget = monitors[monitor]
      ? monitorFingerprint(monitors[monitor])
      : undefined
    updateOutput(output.id, { monitor, monitorTarget, awaitingDisplay: false })
    if (!output.enabled) return
    void activateOutput({ ...output, monitor, monitorTarget })
  }

  const handleRoutingChange = (outputId: string, type: string) => {
    updateOutput(outputId, { contentSource: routingFromType(type) })
  }
  const handleMirrorSourceChange = (outputId: string, sourceOutputId: string) => {
    updateOutput(outputId, {
      contentSource: { type: "mirror", sourceOutputId },
    })
  }
  const handleLayerToggle = (
    output: BroadcastOutput,
    layer: keyof LayerFilter,
    value: boolean
  ) => {
    updateOutput(output.id, {
      contentSource: toggleLayer(output.contentSource, layer, value),
    })
  }

  const selected =
    outputs.find((o) => o.id === selectedId) ??
    outputs.find((o) => o.id === "main")
  const controllerFor = (id: string) =>
    id === "main" ? mainCtrl : id === "alt" ? altCtrl : undefined

  return (
    <div className="flex h-full min-h-0">
      {/* Sidebar */}
      <div className="sticky top-0 flex h-full max-h-full w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border/70 p-3">
        {outputs.map((o) => {
          const Icon = o.mode === "stage" ? MonitorIcon : CastIcon
          const live = o.enabled
          return (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                o.id === selected?.id
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  o.mode === "stage"
                    ? "bg-purple-400"
                    : live
                      ? "bg-emerald-400"
                      : "bg-muted-foreground/40"
                )}
              />
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {o.name}
              </span>
            </button>
          )
        })}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="mt-auto w-full justify-center gap-1.5 border-dashed"
            >
              <PlusIcon className="size-3.5" />
              {t("addOutput")}
              <ChevronDownIcon className="size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={() => handleAddOutput("program")}>
              <CastIcon className="size-4" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {t("addProgramOutput")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t("addProgramOutputHint")}
                </span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleAddOutput("stage")}>
              <MonitorIcon className="size-4" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t("addStageOutput")}</span>
                <span className="text-xs text-muted-foreground">
                  {t("addStageOutputHint")}
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Detail */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
        {selected && (
          <OutputDetail
            key={selected.id}
            output={selected}
            controller={controllerFor(selected.id)}
            themes={themes}
            outputs={outputs}
            monitors={monitors}
            refreshing={refreshing}
            onRefreshMonitors={fetchMonitors}
            onToggleEnabled={handleToggleEnabled}
            onThemeChange={(id, themeId) => updateOutput(id, { themeId })}
            onOutputTypeChange={handleOutputTypeChange}
            onNdiConfigChange={handleNdiConfigChange}
            onNameChange={(id, name) => updateOutput(id, { name })}
            onMonitorChange={handleMonitorChange}
            onRoutingChange={handleRoutingChange}
            onMirrorSourceChange={handleMirrorSourceChange}
            onLayerToggle={handleLayerToggle}
            onUpdateStageConfig={updateStageConfig}
            onRemove={handleRemoveOutput}
            wouldCoverOperator={wouldCoverOperator}
          />
        )}
      </div>
    </div>
  )
}
