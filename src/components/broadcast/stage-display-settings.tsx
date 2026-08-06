import { useBroadcastStore } from "@/stores/broadcast-store"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { MonitorIcon } from "lucide-react"

export function StageDisplaySettings() {
  const altOutput = useBroadcastStore((s) =>
    s.outputs.find((o) => o.id === "alt")
  )
  const isStageMode = altOutput?.mode === "stage"
  const config = altOutput?.stageConfig ?? DEFAULT_STAGE_DISPLAY_CONFIG
  const updateStageConfig = useBroadcastStore((s) => s.updateStageConfig)
  const updateOutput = useBroadcastStore((s) => s.updateOutput)
  const update = (updates: Record<string, unknown>) =>
    updateStageConfig("alt", updates)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MonitorIcon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Stage Display</span>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">
          Use alt output as stage monitor
        </label>
        <Switch
          checked={isStageMode}
          onCheckedChange={(enabled) =>
            updateOutput("alt", { mode: enabled ? "stage" : "normal" })
          }
        />
      </div>

      {isStageMode && (
        <div className="space-y-3 rounded-md border border-border/50 bg-muted/30 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Layout</label>
              <Select
                value={config.layout}
                onValueChange={(v) =>
                  update({ layout: v as "standard" | "minimal" })
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
                  update({ clockFormat: v as "12h" | "24h" })
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
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Show current content
              </label>
              <Switch
                checked={config.showCurrent}
                onCheckedChange={(showCurrent) => update({ showCurrent })}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Show clock
              </label>
              <Switch
                checked={config.showClock}
                onCheckedChange={(showClock) => update({ showClock })}
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Show notes
              </label>
              <Switch
                checked={config.showNotes}
                onCheckedChange={(showNotes) => update({ showNotes })}
              />
            </div>
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
                  onChange={(e) => update({ backgroundColor: e.target.value })}
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
                  onChange={(e) => update({ textColor: e.target.value })}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border"
                />
                <span className="text-xs text-muted-foreground">
                  {config.textColor}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
