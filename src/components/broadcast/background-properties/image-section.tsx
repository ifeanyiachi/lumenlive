import { useBroadcastStore } from "@/stores/broadcast-store"
import { useMediaStore } from "@/stores/media-store"
import { pickThemeBackgroundImage } from "@/lib/theme-designer-files"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { parseColorOpacity, buildColorWithOpacity } from "./helpers"

export function ImageSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !draftTheme.background.image) return null

  const image = draftTheme.background.image
  const tint = image.tint
    ? parseColorOpacity(image.tint)
    : { hex: "#000000", opacity: 50 }

  return (
    <div className="flex flex-col gap-3">
      {/* Image Source */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Background Image
        </label>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            void (async () => {
              const picked = await pickThemeBackgroundImage()
              if (picked) {
                update("background.image.url", picked.url)
                void useMediaStore.getState().importPaths([picked.path])
              }
            })()
          }}
        >
          Change Image
        </Button>
      </div>

      {/* Fit Mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Fit Mode
        </label>
        <Select
          value={image.fit}
          onValueChange={(v) => update("background.image.fit", v)}
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

      {/* Effects */}
      <div className="flex flex-col gap-3 border-t pt-3">
        <h4 className="text-xs font-semibold">Effects</h4>

        {/* Blur */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Blur
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {image.blur}px
            </span>
          </div>
          <Slider
            min={0}
            max={50}
            step={1}
            value={[image.blur]}
            onValueChange={([v]) => update("background.image.blur", v)}
          />
        </div>

        {/* Brightness */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Brightness
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {image.brightness}%
            </span>
          </div>
          <Slider
            min={0}
            max={200}
            step={1}
            value={[image.brightness]}
            onValueChange={([v]) => update("background.image.brightness", v)}
          />
        </div>
      </div>

      {/* Color Overlay */}
      <div className="flex flex-col gap-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">Color Overlay</h4>
          <input
            type="checkbox"
            checked={image.tint !== null}
            onChange={(e) => {
              if (e.target.checked) {
                update(
                  "background.image.tint",
                  buildColorWithOpacity("#000000", 50)
                )
              } else {
                update("background.image.tint", null)
              }
            }}
            className="h-4 w-4 rounded border-input accent-primary"
          />
        </div>

        {image.tint !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={tint.hex}
                onChange={(e) =>
                  update(
                    "background.image.tint",
                    buildColorWithOpacity(e.target.value, tint.opacity)
                  )
                }
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={tint.hex}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    update(
                      "background.image.tint",
                      buildColorWithOpacity(v, tint.opacity)
                    )
                  }
                }}
                className="w-20 font-mono"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Opacity
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tint.opacity}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[tint.opacity]}
              onValueChange={([v]) =>
                update(
                  "background.image.tint",
                  buildColorWithOpacity(tint.hex, v)
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
