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
import { MonitorIcon, RadioIcon, RefreshCwIcon } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { useBroadcastStore } from "@/stores"
import { findOutput } from "@/lib/broadcast/output-selectors"
import { primaryMonitorIndex, monitorLabel } from "@/lib/broadcast/monitors"
import { isTauri } from "@/services/tauri-env"
import type { Monitor } from "@/services/broadcast-window-gateway"
import type { BroadcastOutput, OutputDisplayMode } from "@/types"
import type { OutputController } from "@/hooks/use-output-controller"
import { NdiSettings } from "./ndi-settings"

const MAX_VERSE_SCALE_OPTIONS = [
  { value: "1.25", label: "1.25×" },
  { value: "1.5", label: "1.5×" },
  { value: "2", label: "2×" },
  { value: "3", label: "3×" },
]

/**
 * Per-output reflow controls: how the output surface is sized (match the monitor
 * vs a fixed custom resolution) and whether verse text auto-fits the box height.
 * Writes go through the store, which pushes each change to the live output window
 * immediately — so operators can tune it with the preview open.
 */
function OutputDisplaySettings({ output }: { output: BroadcastOutput }) {
  const store = useBroadcastStore.getState
  const displayMode = output.displayMode ?? "native"
  const custom = output.customResolution ?? { width: 1920, height: 1080 }
  const customFit = output.customFit ?? "contain"
  const autoFit = output.verseAutoFit ?? true
  const maxScale = output.maxVerseScale ?? 1.5
  const minSize = output.minVerseFontSize ?? 40
  const paginate = output.paginateLongVerses ?? true

  return (
    <div className="space-y-2.5 rounded-md border border-border/60 p-2.5">
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Display size</label>
        <Select
          value={displayMode}
          onValueChange={(v) =>
            store().setOutputDisplayMode(output.id, v as OutputDisplayMode)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="native">Match monitor (fill screen)</SelectItem>
            <SelectItem value="custom">Custom size…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {displayMode === "custom" && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[0.625rem] text-muted-foreground">
                Width
              </label>
              <Input
                type="number"
                value={custom.width}
                onChange={(e) =>
                  store().setOutputCustomResolution(output.id, {
                    width: Math.max(1, Number(e.target.value)),
                    height: custom.height,
                  })
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[0.625rem] text-muted-foreground">
                Height
              </label>
              <Input
                type="number"
                value={custom.height}
                onChange={(e) =>
                  store().setOutputCustomResolution(output.id, {
                    width: custom.width,
                    height: Math.max(1, Number(e.target.value)),
                  })
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
          <Select
            value={customFit}
            onValueChange={(v) =>
              store().setOutputCustomFit(output.id, v as "contain" | "cover")
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contain">Fit (letterbox)</SelectItem>
              <SelectItem value="cover">Fill (crop edges)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-muted-foreground">
          Auto-fit verse text
        </label>
        <Switch
          checked={autoFit}
          onCheckedChange={(v) => store().setVerseAutoFit(output.id, v)}
        />
      </div>

      {autoFit && (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Max verse scale
            </label>
            <Select
              value={String(maxScale)}
              onValueChange={(v) => store().setMaxVerseScale(output.id, Number(v))}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAX_VERSE_SCALE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              Minimum verse size (px)
            </label>
            <Input
              type="number"
              min={8}
              value={minSize}
              onChange={(e) =>
                store().setMinVerseFontSize(
                  output.id,
                  Math.max(8, Number(e.target.value))
                )
              }
              className="h-8 text-xs"
            />
            <p className="text-[10px] leading-tight text-muted-foreground">
              Verses won&apos;t shrink below this. Long passages split into pages
              instead.
            </p>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="text-xs text-muted-foreground">
              Paginate long verses
            </label>
            <Switch
              checked={paginate}
              onCheckedChange={(v) => store().setPaginateLongVerses(output.id, v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export interface OutputCardProps {
  controller: OutputController
  title: string
  icon: LucideIcon
  themes: Array<{ id: string; name: string }>
  monitors: Monitor[]
  refreshing: boolean
  onRefreshMonitors: () => void
  ndiSourceNamePlaceholder: string
}

/**
 * One broadcast-output configuration card (header + enable switch, theme select,
 * display/NDI type toggle, and the type-specific controls) — the single source
 * for both the Main and Alternate outputs (D3). Everything output-specific comes
 * from the injected {@link OutputController}; only cosmetic identity (title, icon,
 * NDI placeholder) and shared monitor state are passed alongside.
 */
export function OutputCard({
  controller: c,
  title,
  icon: Icon,
  themes,
  monitors,
  refreshing,
  onRefreshMonitors,
  ndiSourceNamePlaceholder,
}: OutputCardProps) {
  const output = findOutput(
    useBroadcastStore((s) => s.outputs),
    c.outputId
  )
  const primaryIndex = primaryMonitorIndex(monitors)

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      {/* Card header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs",
              c.enabled ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {c.enabled ? "On" : "Off"}
          </span>
          <Switch
            checked={c.enabled}
            onCheckedChange={c.toggle}
            disabled={c.displayOnOperatorScreen && !c.enabled}
          />
        </div>
      </div>

      {/* Theme selector */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Theme</label>
        <Select value={c.themeId} onValueChange={c.setTheme}>
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

      {/* Output type toggle */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Output Type</label>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => c.setOutputType("display")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
              c.outputType === "display"
                ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            <MonitorIcon className="size-3.5" />
            External Display
          </button>
          <button
            onClick={() => c.setOutputType("ndi")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-all",
              c.outputType === "ndi"
                ? "border-lime-500/50 bg-lime-500/15 text-lime-400"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            )}
          >
            <RadioIcon className="size-3.5" />
            NDI
          </button>
        </div>
      </div>

      {/* Output-type-specific controls */}
      {c.outputType === "display" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground">
                Target Monitor
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
                Refresh
              </Button>
            </div>
            <Select
              value={c.selectedMonitor}
              onValueChange={c.setSelectedMonitor}
              disabled={monitors.length === 0}
            >
              <SelectTrigger className="w-full" disabled={monitors.length === 0}>
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
                    {monitorLabel(m, i, primaryIndex)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isTauri && (
              <p className="text-[0.625rem] text-muted-foreground">
                Display output and preview are only available in the LumenLive
                desktop app.
              </p>
            )}
            {c.displayOnOperatorScreen && (
              <p className="text-[0.625rem] text-amber-500">
                This is your control screen — output stays off so it won&apos;t
                cover your workspace. Connect a second display to send output
                there, or switch to NDI.
              </p>
            )}
          </div>

          {output && <OutputDisplaySettings output={output} />}
        </div>
      ) : (
        <div className="space-y-3">
          <NdiSettings
            controller={c}
            sourceNamePlaceholder={ndiSourceNamePlaceholder}
          />
          {output && <OutputDisplaySettings output={output} />}
        </div>
      )}
    </div>
  )
}
