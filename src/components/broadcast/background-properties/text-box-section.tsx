import { useBroadcastStore } from "@/stores/broadcast-store"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { parseColorOpacity } from "./helpers"

export function TextBoxSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const textBox = draftTheme.textBox
  const { hex: boxColorHex } = parseColorOpacity(textBox.color)

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Text Box</h4>
        <input
          type="checkbox"
          checked={textBox.enabled}
          onChange={(e) => {
            update("textBox.enabled", e.target.checked)
            if (e.target.checked && textBox.opacity === 0) {
              update("textBox.opacity", 0.5)
            }
          }}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      {textBox.enabled && (
        <div className="flex flex-col gap-3">
          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={boxColorHex}
                onChange={(e) => update("textBox.color", e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={boxColorHex}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    update("textBox.color", v)
                  }
                }}
                className="w-20 font-mono"
              />
            </div>
          </div>

          {/* Opacity */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Opacity
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(textBox.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(textBox.opacity * 100)]}
              onValueChange={([v]) => update("textBox.opacity", v / 100)}
            />
          </div>

          {/* Border Radius */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Border Radius
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {textBox.borderRadius}px
              </span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[textBox.borderRadius]}
              onValueChange={([v]) => update("textBox.borderRadius", v)}
            />
          </div>

          {/* Padding */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Padding
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {textBox.padding}px
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[textBox.padding]}
              onValueChange={([v]) => update("textBox.padding", v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
