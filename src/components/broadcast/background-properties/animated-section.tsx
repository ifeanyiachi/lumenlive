import { useBroadcastStore } from "@/stores/broadcast-store"
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
import { PlusIcon, XIcon } from "lucide-react"
import type { AnimatedBackgroundPreset } from "@/types/canvas"
import { PRESET_LABELS } from "./helpers"

export function AnimatedSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  const animated = draftTheme?.background.animated
  if (!draftTheme || !animated) return null

  const setPalette = (palette: string[]) =>
    update("background.animated.palette", palette)

  return (
    <div className="flex flex-col gap-3">
      {/* Preset */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Style
        </label>
        <Select
          value={animated.preset}
          onValueChange={(v) => update("background.animated.preset", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(
              Object.entries(PRESET_LABELS) as [
                AnimatedBackgroundPreset,
                string,
              ][]
            ).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Palette (1–4 colors) */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Colors
        </label>
        <div className="flex flex-wrap items-center gap-1.5">
          {animated.palette.map((color, i) => (
            <div key={i} className="group relative">
              <input
                type="color"
                value={color}
                onChange={(e) => {
                  const next = [...animated.palette]
                  next[i] = e.target.value
                  setPalette(next)
                }}
                className="size-7 cursor-pointer rounded border border-input"
                aria-label={`Color ${i + 1}`}
              />
              {animated.palette.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove color ${i + 1}`}
                  onClick={() =>
                    setPalette(animated.palette.filter((_, j) => j !== i))
                  }
                  className="absolute -top-1 -right-1 hidden rounded-full bg-background text-muted-foreground shadow group-hover:block hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>
          ))}
          {animated.palette.length < 4 && (
            <Button
              variant="outline"
              size="icon-sm"
              className="size-7"
              aria-label="Add color"
              onClick={() => setPalette([...animated.palette, "#ffffff"])}
            >
              <PlusIcon className="size-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Speed */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Speed
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {animated.speed.toFixed(2)}×
          </span>
        </div>
        <Slider
          min={0.25}
          max={2}
          step={0.05}
          value={[animated.speed]}
          onValueChange={([v]) => update("background.animated.speed", v)}
        />
      </div>

      {/* Intensity */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">
            Intensity
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {Math.round(animated.intensity * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[animated.intensity]}
          onValueChange={([v]) => update("background.animated.intensity", v)}
        />
      </div>

      {/* Base wash color */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Base color
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={animated.baseColor ?? "#000000"}
            onChange={(e) =>
              update("background.animated.baseColor", e.target.value)
            }
            className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
          />
          <Input
            value={animated.baseColor ?? "#000000"}
            onChange={(e) => {
              const v = e.target.value
              if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                update("background.animated.baseColor", v)
              }
            }}
            className="w-20 font-mono"
          />
        </div>
      </div>
    </div>
  )
}
