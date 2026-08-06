import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"

interface ShadowValue {
  color: string
  blur: number
  x: number
  y: number
}

interface OutlineValue {
  color: string
  width: number
}

function parseColorOpacity(color: string): { hex: string; opacity: number } {
  if (color.length === 9 && color.startsWith("#")) {
    const alphaHex = color.slice(7, 9)
    const alpha = parseInt(alphaHex, 16) / 255
    return { hex: color.slice(0, 7), opacity: Math.round(alpha * 100) }
  }
  if (color.length === 7 && color.startsWith("#")) {
    return { hex: color, opacity: 100 }
  }
  return { hex: color || "#000000", opacity: 100 }
}

function buildColorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 100) return hex
  const alphaHex = Math.round((opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}

export function TextShadowControls({
  shadow,
  onToggle,
  onUpdate,
}: {
  shadow: ShadowValue | null
  onToggle: (enabled: boolean) => void
  onUpdate: (path: string, value: number | string) => void
}) {
  const shadowColor = shadow
    ? parseColorOpacity(shadow.color)
    : { hex: "#000000", opacity: 100 }

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold">Text Shadow</label>
        <input
          type="checkbox"
          checked={shadow !== null}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      {shadow && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Offset X
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {shadow.x}px
              </span>
            </div>
            <Slider
              min={-20}
              max={50}
              step={1}
              value={[shadow.x]}
              onValueChange={([v]) => onUpdate("x", v)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Offset Y
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {shadow.y}px
              </span>
            </div>
            <Slider
              min={-20}
              max={50}
              step={1}
              value={[shadow.y]}
              onValueChange={([v]) => onUpdate("y", v)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Blur
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {shadow.blur}px
              </span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[shadow.blur]}
              onValueChange={([v]) => onUpdate("blur", v)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Shadow Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={shadowColor.hex}
                onChange={(e) =>
                  onUpdate(
                    "color",
                    buildColorWithOpacity(e.target.value, shadowColor.opacity)
                  )
                }
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={shadowColor.hex}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    onUpdate(
                      "color",
                      buildColorWithOpacity(v, shadowColor.opacity)
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
                {shadowColor.opacity}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[shadowColor.opacity]}
              onValueChange={([v]) =>
                onUpdate("color", buildColorWithOpacity(shadowColor.hex, v))
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function TextOutlineControls({
  outline,
  onToggle,
  onUpdate,
}: {
  outline: OutlineValue | null
  onToggle: (enabled: boolean) => void
  onUpdate: (path: string, value: number | string) => void
}) {
  const outlineColor = outline
    ? parseColorOpacity(outline.color)
    : { hex: "#000000", opacity: 100 }

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold">Text Outline</label>
        <input
          type="checkbox"
          checked={outline !== null}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      {outline && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Width
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {outline.width}px
              </span>
            </div>
            <Slider
              min={0}
              max={20}
              step={0.5}
              value={[outline.width]}
              onValueChange={([v]) => onUpdate("width", v)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Outline Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={outlineColor.hex}
                onChange={(e) => onUpdate("color", e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={outlineColor.hex}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    onUpdate("color", v)
                  }
                }}
                className="w-20 font-mono"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
