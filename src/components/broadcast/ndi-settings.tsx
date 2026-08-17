import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { CastIcon } from "lucide-react"
import type { NdiAlphaMode, NdiFrameRate, NdiResolution } from "@/types"
import type { OutputController } from "@/hooks/use-output-controller"

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

const NDI_ALPHA_OPTIONS: Array<{ value: NdiAlphaMode; label: string }> = [
  { value: "noneOpaque", label: "Solid background (full picture)" },
  {
    value: "straightAlpha",
    label: "Transparent background (for overlay/keying)",
  },
]

/**
 * The NDI feed controls (resolution / frame rate / alpha / source name + the
 * Start/Stop button), driven by an {@link OutputController}. Shared by every
 * output card so the NDI settings are declared once, not per output.
 */
export function NdiSettings({
  controller,
  sourceNamePlaceholder = "LumenLive Output",
}: {
  controller: OutputController
  sourceNamePlaceholder?: string
}) {
  const {
    ndiResolution,
    setNdiResolution,
    ndiFrameRate,
    setNdiFrameRate,
    ndiAlphaMode,
    setNdiAlphaMode,
    ndiSourceName,
    setNdiSourceName,
    ndiActive,
    toggleNdi,
  } = controller

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Resolution</label>
          <Select
            value={ndiResolution}
            onValueChange={(v) => setNdiResolution(v as NdiResolution)}
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
          <label className="text-xs text-muted-foreground">Frame Rate</label>
          <Select
            value={ndiFrameRate}
            onValueChange={(v) => setNdiFrameRate(v as NdiFrameRate)}
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
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Alpha Channel</label>
        <Select
          value={ndiAlphaMode}
          onValueChange={(v) => setNdiAlphaMode(v as NdiAlphaMode)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NDI_ALPHA_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground">Source Name</label>
        <Input
          value={ndiSourceName}
          onChange={(e) => setNdiSourceName(e.target.value)}
          placeholder={sourceNamePlaceholder}
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className={cn(
          "w-full gap-1.5",
          ndiActive &&
            "border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400"
        )}
        onClick={toggleNdi}
      >
        <CastIcon className="size-3.5" />
        {ndiActive ? "Stop NDI" : "Start NDI"}
      </Button>
    </div>
  )
}
