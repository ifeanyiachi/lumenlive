import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { useBroadcastStore } from "@/stores"
import type { BroadcastOutput, StageDisplayConfig } from "@/types/broadcast"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import { MonitorIcon, PencilIcon } from "lucide-react"

const CLASSIC_LAYOUT = "__classic__"

export function StageConfigPanel({
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
                <ColorSwatch
                  value={config.backgroundColor}
                  onChange={(backgroundColor) => onUpdate({ backgroundColor })}
                  className="h-8 w-8 shrink-0"
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
                <ColorSwatch
                  value={config.textColor}
                  onChange={(textColor) => onUpdate({ textColor })}
                  className="h-8 w-8 shrink-0"
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
