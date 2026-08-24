import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  closeBroadcastWindow,
  listMonitors,
  type Monitor,
} from "@/services/broadcast-window-gateway"
import {
  operatorScreenIndex,
  monitorFingerprint,
  resolveOutputMonitorIndex,
} from "@/lib/broadcast/monitors"
import { activateExtraOutput } from "@/hooks/use-awaiting-display-resume"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useBroadcastStore, useSettingsStore } from "@/stores"
import { useThemesStore } from "@/stores/themes"
import { buildThemeRegistry } from "@/lib/theme/registry"
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
  // An output renders scripture (verse look) + drives its idle/base backdrop, so it is
  // assigned a scripture-type Theme from the new typed store (themeredo.md, VR4).
  const customThemes = useThemesStore((s) => s.customThemes)
  const themes = useMemo(
    () =>
      buildThemeRegistry(customThemes).filter((t) => t.type === "scripture"),
    [customThemes]
  )
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

  // Activate an extra output, toasting the fail-safe outcomes. Delegates to the
  // shared activator (also used by the app-root resume poll) so manual and
  // automatic activation behave identically: resolve the assigned display, then
  // open it, hold ("assigned display not connected"), or refuse to cover the
  // operator's own screen.
  const activateOutput = useCallback(
    async (output: BroadcastOutput) => {
      const result = await activateExtraOutput(output.id, monitors)
      if (result === "absent") {
        toast.warning(
          `${output.name}: assigned display not connected — it'll start automatically when reconnected, or pick a monitor above`
        )
      }
    },
    [monitors]
  )

  const handleAddOutput = () => {
    const newOutput: BroadcastOutput = {
      id: crypto.randomUUID().slice(0, 8),
      name: `Output ${outputs.length + 1}`,
      // Seed from the app-wide default Scripture theme, falling back to the
      // first available scripture theme.
      themeId:
        useSettingsStore.getState().scriptureDefaultThemeId ||
        themes[0]?.id ||
        "",
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
    const monitor = resolveOutputMonitorIndex(
      output.monitorTarget,
      output.monitor,
      monitors
    )
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
      // Explicit off also cancels any pending "awaiting display" hold.
      updateOutput(output.id, { enabled: false, awaitingDisplay: false })
      void closeBroadcastWindow(output.id).catch(() => {})
      return
    }
    // Enabling an extra output: resolve + open (or hold / refuse-operator-screen)
    // via the shared activator, which persists the concrete monitor + fingerprint
    // so re-enabling later reselects the same physical display.
    void activateOutput(output)
  }

  // Persist the operator's explicit monitor pick (index + a durable fingerprint),
  // clearing any awaiting-display hold. If the output is enabled, (re)open on the
  // chosen display via the shared activator — which moves an already-open window,
  // or refuses when the pick is the operator's own control screen.
  const handleMonitorChange = (output: BroadcastOutput, value: string) => {
    const monitor = Number(value)
    const monitorTarget = monitors[monitor]
      ? monitorFingerprint(monitors[monitor])
      : undefined
    updateOutput(output.id, { monitor, monitorTarget, awaitingDisplay: false })
    if (!output.enabled || isManagedElsewhere(output.id)) return
    void activateOutput({ ...output, monitor, monitorTarget })
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
