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
import { Button } from "@/components/ui/button"
import { useBroadcastStore } from "@/stores"
import { useCountdownStore } from "@/stores/countdown-store"
import type { BroadcastOutput, ContentRouting } from "@/types/broadcast"
import { PlusIcon } from "lucide-react"
import { OutputRow } from "./output-row"
import { isManagedElsewhere, isTauri } from "./utils"

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
          {outputs.map((output) => (
            <OutputRow
              key={output.id}
              output={output}
              isExpanded={expandedId === output.id}
              themes={themes}
              outputs={outputs}
              monitors={monitors}
              refreshing={refreshing}
              onToggleExpand={() =>
                setExpandedId(expandedId === output.id ? null : output.id)
              }
              onToggleEnabled={handleToggleEnabled}
              onRemove={handleRemoveOutput}
              onNameChange={handleNameChange}
              onThemeChange={handleThemeChange}
              onModeChange={handleModeChange}
              onRefreshMonitors={() => void fetchMonitors()}
              onMonitorChange={handleMonitorChange}
              onRoutingChange={handleRoutingChange}
              onMirrorSourceChange={handleMirrorSourceChange}
              onLayerToggle={handleLayerToggle}
              onUpdateStageConfig={updateStageConfig}
              wouldCoverOperator={wouldCoverOperator}
              monitorLabel={monitorLabel}
            />
          ))}
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
