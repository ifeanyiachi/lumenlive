import { useBroadcastStore } from "@/stores/broadcast-store"
import { useMediaStore } from "@/stores/media-store"
import { pickVideoFile } from "@/lib/theme-designer-files"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"

export function VideoSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !draftTheme.background.video) return null

  const video = draftTheme.background.video
  const fileName = video.url
    ? (video.url.split(/[\\/]/).pop() ?? "No file")
    : "No file selected"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Video File
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              void (async () => {
                const path = await pickVideoFile()
                if (path) {
                  update("background.video.url", path)
                  void useMediaStore.getState().importPaths([path])
                }
              })()
            }}
          >
            {video.url ? "Change Video" : "Choose Video"}
          </Button>
        </div>
        {video.url && (
          <p
            className="truncate text-[11px] text-muted-foreground"
            title={video.url}
          >
            {fileName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Fit Mode
        </label>
        <Select
          value={video.fit}
          onValueChange={(v) => update("background.video.fit", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="stretch">Stretch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Brightness
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {video.brightness}%
          </span>
        </div>
        <Slider
          min={0}
          max={200}
          step={1}
          value={[video.brightness]}
          onValueChange={([v]) => update("background.video.brightness", v)}
        />
      </div>
    </div>
  )
}
