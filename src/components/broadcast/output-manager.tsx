import { useCallback, useEffect, useState } from "react"
import {
  closeBroadcastWindow,
  listMonitors,
  onOutputReady,
  openBroadcastWindow,
  requestOutputResync,
  type Monitor,
} from "@/services/broadcast-window-gateway"
import {
  operatorScreenIndex,
  preferredOutputMonitor,
} from "@/lib/broadcast/monitors"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useBroadcastStore } from "@/stores"
import { useCountdownStore } from "@/stores/countdown-store"
import type {
  BroadcastOutput,
  ContentRouting,
  StageDisplayConfig,
} from "@/types/broadcast"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import {
  PlusIcon,
  Trash2Icon,
  MonitorIcon,
  RadioIcon,
  LayersIcon,
  LinkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react"

const CLASSIC_LAYOUT = "__classic__"

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

/**
 * The built-in outputs own dedicated activation UI (the Display Output and
 * Alternate Output cards in Broadcast Settings), including their own monitor
 * pickers. The Output Manager therefore manages window lifecycle + monitor
 * only for *extra* outputs, so it never double-drives those two.
 */
function isManagedElsewhere(outputId: string): boolean {
  return outputId === "main" || outputId === "alt"
}

export function OutputManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const themes = useBroadcastStore((s) => s.themes)
  const outputs = useBroadcastStore((s) => s.outputs)
  const addOutput = useBroadcastStore((s) => s.addOutput)
  const removeOutput = useBroadcastStore((s) => s.removeOutput)
  const updateOutput = useBroadcastStore((s) => s.updateOutput)
  const updateStageConfig = useBroadcastStore((s) => s.updateStageConfig)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [refreshing, setRefreshing] = useState(false)

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

  // Open an extra output's window on its chosen monitor and push current
  // content once it announces readiness. Mirrors the proven Alternate Output
  // flow (broadcast-settings openAltWindow): a one-shot ready listener syncs
  // the specific output, with a 500ms fallback in case the window was reused
  // (already mounted) and never re-emitted ready.
  const openOutputWindow = useCallback(
    async (output: BroadcastOutput) => {
      const monitorIndex = output.monitor ?? preferredOutputMonitor(monitors)
      const mode = output.mode === "stage" ? "stage" : undefined
      let synced = false
      const syncNow = () => {
        const bs = useBroadcastStore.getState()
        bs.syncBroadcastOutputFor(output.id)
        if (output.mode === "stage") bs.syncStageOutput()
        // Re-push live countdowns so the just-opened window shows a timer that
        // started before it mounted (treated as a replace by output windows).
        useCountdownStore.getState().resyncOutputs()
      }
      const unlisten = await onOutputReady(() => {
        synced = true
        syncNow()
        unlisten()
      })
      try {
        await openBroadcastWindow(output.id, monitorIndex, mode)
        await requestOutputResync(output.id)
        setTimeout(() => {
          if (!synced) {
            syncNow()
            unlisten()
          }
        }, 500)
      } catch {
        unlisten()
      }
    },
    [monitors]
  )

  const handleAddOutput = () => {
    const newOutput: BroadcastOutput = {
      id: crypto.randomUUID().slice(0, 8),
      name: `Output ${outputs.length + 1}`,
      themeId: themes[0]?.id ?? "",
      mode: "normal",
      contentSource: { type: "mirror", sourceOutputId: "main" },
      enabled: false,
    }
    addOutput(newOutput)
    setExpandedId(newOutput.id)
  }

  const handleRemoveOutput = async (outputId: string) => {
    try {
      await closeBroadcastWindow(outputId).catch(() => {})
    } catch {
      /* ignore */
    }
    removeOutput(outputId)
    if (expandedId === outputId) setExpandedId(null)
  }

  // True when opening `output` would fullscreen a borderless, always-on-top
  // window over the operator's own control screen — an inescapable overlay,
  // since the output is non-closable and skips the taskbar. We block this
  // exactly as the main Display Output does. On a single-monitor rig the
  // resolved monitor IS the operator screen, so activation is blocked and the
  // operator runs from the in-app preview (+ NDI).
  const wouldCoverOperator = (output: BroadcastOutput): boolean => {
    if (!isTauri || monitors.length === 0) return false
    const monitor = output.monitor ?? preferredOutputMonitor(monitors)
    return monitor === operatorScreenIndex(monitors)
  }

  const handleToggleEnabled = (output: BroadcastOutput, enabled: boolean) => {
    if (isManagedElsewhere(output.id)) {
      // The built-in main/alt windows are opened from Broadcast Settings; here
      // the switch only records intent, and closes on disable as before.
      updateOutput(output.id, { enabled })
      if (!enabled) void closeBroadcastWindow(output.id).catch(() => {})
      return
    }
    if (!enabled) {
      updateOutput(output.id, { enabled: false })
      void closeBroadcastWindow(output.id).catch(() => {})
      return
    }
    // Enabling an extra output: never open over the operator's control screen.
    // Guard the programmatic path too (the switch is also disabled in this
    // state), so the output stays off rather than trapping the operator.
    if (wouldCoverOperator(output)) return
    // Resolve and persist a concrete monitor so the picker reflects where the
    // window actually opened.
    const monitor = output.monitor ?? preferredOutputMonitor(monitors)
    updateOutput(output.id, { enabled: true, monitor })
    void openOutputWindow({ ...output, enabled: true, monitor })
  }

  // Persist the chosen monitor. If the output's window is already open, move it
  // to the new monitor — unless that would cover the operator's screen, in which
  // case turn the output off instead of trapping the operator there.
  const handleMonitorChange = (output: BroadcastOutput, value: string) => {
    const monitor = Number(value)
    updateOutput(output.id, { monitor })
    if (!output.enabled || isManagedElsewhere(output.id)) return
    if (wouldCoverOperator({ ...output, monitor })) {
      updateOutput(output.id, { enabled: false })
      void closeBroadcastWindow(output.id).catch(() => {})
      return
    }
    void openOutputWindow({ ...output, monitor })
  }

  const handleModeChange = (outputId: string, mode: "normal" | "stage") => {
    updateOutput(outputId, { mode })
  }

  const handleThemeChange = (outputId: string, themeId: string) => {
    updateOutput(outputId, { themeId })
  }

  const handleRoutingChange = (outputId: string, routingType: string) => {
    let contentSource: ContentRouting
    if (routingType === "mirror") {
      contentSource = { type: "mirror", sourceOutputId: "main" }
    } else if (routingType === "layer-filter") {
      contentSource = {
        type: "layer-filter",
        layers: {
          showContent: true,
          showProps: true,
          showAlerts: true,
          showCountdowns: true,
          showMediaLayer: true,
        },
      }
    } else {
      contentSource = { type: "independent" }
    }
    updateOutput(outputId, { contentSource })
  }

  const handleMirrorSourceChange = (
    outputId: string,
    sourceOutputId: string
  ) => {
    updateOutput(outputId, {
      contentSource: { type: "mirror", sourceOutputId },
    })
  }

  const handleLayerToggle = (
    outputId: string,
    output: BroadcastOutput,
    layer: string,
    value: boolean
  ) => {
    if (output.contentSource.type !== "layer-filter") return
    updateOutput(outputId, {
      contentSource: {
        type: "layer-filter",
        layers: { ...output.contentSource.layers, [layer]: value },
      },
    })
  }

  const handleNameChange = (outputId: string, name: string) => {
    updateOutput(outputId, { name })
  }

  const operatorIdx = operatorScreenIndex(monitors)
  const monitorLabel = (m: Monitor, i: number) =>
    `${m.name ?? `Display ${i + 1}`} (${m.size.width}×${m.size.height})${
      i === operatorIdx ? " — Primary (this screen)" : ""
    }`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-[600px]"
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle>Output Manager</DialogTitle>
          <DialogDescription>
            Configure each output's theme and layer routing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {outputs.map((output) => {
            const isExpanded = expandedId === output.id
            const isMain = output.id === "main"

            return (
              <div
                key={output.id}
                className="rounded-lg border border-border bg-card"
              >
                {/* Header row */}
                <div className="flex items-center gap-3 p-3">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : output.id)}
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
                    <span className="truncate text-sm font-medium">
                      {output.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-medium",
                        output.mode === "stage"
                          ? "bg-purple-500/15 text-purple-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {output.mode === "stage" ? "Stage" : "Program"}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "text-xs",
                        output.enabled
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {output.enabled ? "On" : "Off"}
                    </span>
                    <Switch
                      checked={output.enabled}
                      disabled={
                        !isManagedElsewhere(output.id) &&
                        !output.enabled &&
                        wouldCoverOperator(output)
                      }
                      onCheckedChange={(v) => handleToggleEnabled(output, v)}
                    />
                    {!isMain && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="size-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveOutput(output.id)}
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
                      <label className="text-xs text-muted-foreground">
                        Name
                      </label>
                      <Input
                        value={output.name}
                        onChange={(e) =>
                          handleNameChange(output.id, e.target.value)
                        }
                        placeholder="Output name"
                      />
                    </div>

                    {/* Theme */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">
                        Theme
                      </label>
                      <Select
                        value={output.themeId}
                        onValueChange={(v) => handleThemeChange(output.id, v)}
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
                      <label className="text-xs text-muted-foreground">
                        Mode
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => handleModeChange(output.id, "normal")}
                          className={cn(
                            "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                            output.mode === "normal"
                              ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <RadioIcon className="size-3.5" />
                          Program
                        </button>
                        <button
                          onClick={() => handleModeChange(output.id, "stage")}
                          className={cn(
                            "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
                            output.mode === "stage"
                              ? "border-purple-500/50 bg-purple-500/15 text-purple-400"
                              : "border-border bg-background text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <MonitorIcon className="size-3.5" />
                          Stage
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
                            Target Monitor
                          </label>
                          <Button
                            variant="ghost"
                            size="xs"
                            disabled={refreshing}
                            onClick={() => void fetchMonitors()}
                            className="h-5 gap-1 px-1.5 text-[0.625rem] text-muted-foreground"
                          >
                            <RefreshCwIcon
                              className={cn(
                                "size-3",
                                refreshing && "animate-spin"
                              )}
                            />
                            Refresh
                          </Button>
                        </div>
                        <Select
                          value={
                            output.monitor != null ? String(output.monitor) : ""
                          }
                          onValueChange={(v) => handleMonitorChange(output, v)}
                          disabled={monitors.length === 0}
                        >
                          <SelectTrigger
                            className="w-full"
                            disabled={monitors.length === 0}
                          >
                            <SelectValue
                              placeholder={
                                !isTauri
                                  ? "Desktop app required"
                                  : monitors.length === 0
                                    ? "No monitors detected"
                                    : "Select monitor"
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
                            Display output is only available in the LumenLive
                            desktop app.
                          </p>
                        )}
                        {wouldCoverOperator(output) && (
                          <p className="text-[0.625rem] text-amber-500">
                            This is your control screen — output stays off so it
                            won't cover your workspace (you couldn't close it).
                            Connect a second display to send output there, or
                            use NDI.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Stage Display Config */}
                    {output.mode === "stage" && (
                      <StageConfigPanel
                        output={output}
                        onUpdate={(updates) =>
                          updateStageConfig(output.id, updates)
                        }
                      />
                    )}

                    {/* Content Routing */}
                    {output.mode !== "stage" && (
                      <div className="space-y-1.5">
                        <label className="flex items-center gap-1 text-xs text-muted-foreground">
                          <LinkIcon className="size-3" />
                          Content Routing
                        </label>
                        <Select
                          value={output.contentSource.type}
                          onValueChange={(v) =>
                            handleRoutingChange(output.id, v)
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="independent">
                              Full program
                            </SelectItem>
                            <SelectItem value="mirror">
                              Mirror another output
                            </SelectItem>
                            <SelectItem value="layer-filter">
                              Layer Filter
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        {/* Mirror source selector */}
                        {output.contentSource.type === "mirror" && (
                          <Select
                            value={output.contentSource.sourceOutputId}
                            onValueChange={(v) =>
                              handleMirrorSourceChange(output.id, v)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Mirror source" />
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
                              Visible layers
                            </div>
                            {(
                              [
                                ["showContent", "Content (Verse/Slide/Media)"],
                                ["showProps", "Props Overlay"],
                                ["showAlerts", "Alert Overlay"],
                                ["showCountdowns", "Countdown Overlay"],
                                ["showMediaLayer", "Media Layer"],
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
                                    handleLayerToggle(output.id, output, key, v)
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
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5"
          onClick={handleAddOutput}
        >
          <PlusIcon className="size-3.5" />
          Add Output
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function StageConfigPanel({
  output,
  onUpdate,
}: {
  output: BroadcastOutput
  onUpdate: (updates: Partial<StageDisplayConfig>) => void
}) {
  const config = output.stageConfig ?? DEFAULT_STAGE_DISPLAY_CONFIG
  const stageLayouts = useBroadcastStore((s) => s.stageLayouts)
  const updateOutput = useBroadcastStore((s) => s.updateOutput)
  const selectedLayoutId = output.stageLayoutId ?? CLASSIC_LAYOUT
  const usingLayout = output.stageLayoutId != null

  const handleLayoutChange = (value: string) => {
    updateOutput(output.id, {
      stageLayoutId: value === CLASSIC_LAYOUT ? undefined : value,
    })
  }

  const editSelectedLayout = () => {
    const store = useBroadcastStore.getState()
    if (output.stageLayoutId)
      store.startEditingStageLayout(output.stageLayoutId)
    else store.setStageDesignerOpen(true)
  }

  return (
    <div className="space-y-3 rounded-md border border-border/50 bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MonitorIcon className="size-3" />
        Stage Display Settings
      </div>

      {/* Stage Layout preset picker — switches instantly, non-destructive. */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Stage Layout</label>
        <div className="flex items-center gap-1.5">
          <Select value={selectedLayoutId} onValueChange={handleLayoutChange}>
            <SelectTrigger className="h-8 flex-1 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLASSIC_LAYOUT}>Classic settings</SelectItem>
              {stageLayouts.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={editSelectedLayout}
            title="Open in the Stage Layout Designer"
          >
            <PencilIcon className="size-3" />
            Edit
          </Button>
        </div>
      </div>

      {usingLayout && (
        <p className="text-[0.6875rem] text-muted-foreground">
          This output uses the “
          {stageLayouts.find((l) => l.id === output.stageLayoutId)?.name ??
            "selected"}
          ” preset. Edit it in the designer, or pick “Classic settings” to use
          the toggles below.
        </p>
      )}

      {!usingLayout && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Layout</label>
              <Select
                value={config.layout}
                onValueChange={(v) =>
                  onUpdate({ layout: v as "standard" | "minimal" })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="minimal">Minimal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Clock Format
              </label>
              <Select
                value={config.clockFormat}
                onValueChange={(v) =>
                  onUpdate({ clockFormat: v as "12h" | "24h" })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12h">12-hour</SelectItem>
                  <SelectItem value="24h">24-hour</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            {(
              [
                ["showCurrent", "Show current content"],
                ["showClock", "Show clock"],
                ["showNotes", "Show notes"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">{label}</label>
                <Switch
                  checked={config[key]}
                  onCheckedChange={(v) => onUpdate({ [key]: v })}
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Background
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.backgroundColor}
                  onChange={(e) =>
                    onUpdate({ backgroundColor: e.target.value })
                  }
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border"
                />
                <span className="text-xs text-muted-foreground">
                  {config.backgroundColor}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Text Color
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config.textColor}
                  onChange={(e) => onUpdate({ textColor: e.target.value })}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border"
                />
                <span className="text-xs text-muted-foreground">
                  {config.textColor}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
