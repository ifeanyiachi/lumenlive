import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { ColorSwatch } from "@/components/ui/color-swatch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlusIcon, TrashIcon } from "lucide-react"

export interface GradientStop {
  color: string
  position: number
}

export interface GradientValue {
  type: "linear" | "radial"
  angle: number
  stops: GradientStop[]
}

export function GradientControls({
  gradient,
  onUpdate,
}: {
  gradient: GradientValue
  onUpdate: (gradient: GradientValue) => void
}) {
  const updateGradient = (patch: Partial<GradientValue>) => {
    onUpdate({ ...gradient, ...patch })
  }

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const stops = [...gradient.stops]
    stops[index] = { ...stops[index], ...patch }
    updateGradient({ stops })
  }

  const addStop = () => {
    const sorted = [...gradient.stops].sort((a, b) => a.position - b.position)
    let newPosition = 50
    if (sorted.length >= 2) {
      let maxGap = 0
      let gapMid = 50
      for (let i = 0; i < sorted.length - 1; i++) {
        const gap = sorted[i + 1].position - sorted[i].position
        if (gap > maxGap) {
          maxGap = gap
          gapMid = (sorted[i].position + sorted[i + 1].position) / 2
        }
      }
      newPosition = gapMid
    }
    updateGradient({
      stops: [
        ...gradient.stops,
        { position: Math.round(newPosition), color: "#888888" },
      ],
    })
  }

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return
    const stops = gradient.stops.filter((_, i) => i !== index)
    updateGradient({ stops })
  }

  const stopsStr = gradient.stops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${Math.round(s.position)}%`)
    .join(", ")

  const cssPreview =
    gradient.type === "linear"
      ? `linear-gradient(${gradient.angle}deg, ${stopsStr})`
      : `radial-gradient(circle, ${stopsStr})`

  return (
    <div className="flex flex-col gap-2.5">
      {/* Preview bar */}
      <div
        className="h-6 w-full rounded border border-border"
        style={{ background: cssPreview }}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-[0.6875rem] text-muted-foreground">Style</label>
        <Select
          value={gradient.type}
          onValueChange={(v) =>
            updateGradient({ type: v as "linear" | "radial" })
          }
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="linear">Linear</SelectItem>
            <SelectItem value="radial">Radial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {gradient.type === "linear" && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-[0.6875rem] text-muted-foreground">
              Angle
            </label>
            <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
              {gradient.angle}&deg;
            </span>
          </div>
          <Slider
            value={[gradient.angle]}
            onValueChange={([v]) => updateGradient({ angle: v })}
            min={0}
            max={360}
            step={1}
          />
        </div>
      )}

      {/* Color stops */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[0.6875rem] text-muted-foreground">
            Color Stops
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-5"
            onClick={addStop}
            title="Add stop"
          >
            <PlusIcon className="size-3" />
          </Button>
        </div>

        {gradient.stops.map((stop, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <ColorSwatch
              value={stop.color}
              onChange={(color) => updateStop(i, { color })}
              className="size-6"
            />
            <Input
              value={stop.color}
              onChange={(e) => updateStop(i, { color: e.target.value })}
              className="h-6 flex-1 font-mono text-[0.625rem]"
            />
            <Input
              type="number"
              value={Math.round(stop.position)}
              onChange={(e) =>
                updateStop(i, { position: Number(e.target.value) })
              }
              className="h-6 w-14 text-[0.625rem]"
              min={0}
              max={100}
              title="Position %"
            />
            {gradient.stops.length > 2 && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-5 text-destructive"
                onClick={() => removeStop(i)}
                title="Remove stop"
              >
                <TrashIcon className="size-2.5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SolidControls({
  color,
  onChange,
}: {
  color: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <ColorSwatch value={color} onChange={onChange} className="size-7" />
      <Input
        value={color}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 flex-1 font-mono text-xs"
      />
    </div>
  )
}
