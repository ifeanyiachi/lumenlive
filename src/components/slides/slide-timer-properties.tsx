import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TimerIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import { ElementAnimationProperties } from "@/components/slides/element-animation-properties"
import {
  PropertyRow,
  ShadowSection,
  OutlineSection,
  PositionSizeSection,
} from "@/components/slides/element-property-sections"
import type { SlideTimerElement } from "@/types/slide"
import type { CountdownFormat, CountdownMode } from "@/types/alert"

/** Parse an optional seconds field: blank → undefined, otherwise a clamped int. */
function parseThreshold(raw: string): number | undefined {
  const trimmed = raw.trim()
  if (trimmed === "") return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

/**
 * Type-specific properties for a {@link SlideTimerElement} — the Countdown theme's
 * placeholder controls. Leads with the timer behaviour (mode, length/target,
 * display format, overtime, urgency thresholds), then typography and layout.
 */
export function SlideTimerProperties({
  element,
}: {
  element: SlideTimerElement
}) {
  const update = (updates: Partial<SlideTimerElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Timer Properties"
        icon={<TimerIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Timer behaviour */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Timer
            </span>
            <PropertyRow label="Mode">
              <Select
                value={element.mode}
                onValueChange={(v) => update({ mode: v as CountdownMode })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="duration">Duration</SelectItem>
                  <SelectItem value="clock">Time of day</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            {element.mode === "clock" ? (
              <PropertyRow label="Target">
                <Input
                  type="time"
                  value={element.targetTime ?? ""}
                  onChange={(e) => update({ targetTime: e.target.value })}
                  className="h-7 text-xs"
                />
              </PropertyRow>
            ) : (
              <PropertyRow label="Seconds">
                <Input
                  type="number"
                  value={element.durationSeconds}
                  onChange={(e) =>
                    update({
                      durationSeconds: Math.max(0, Number(e.target.value)),
                    })
                  }
                  className="h-7 text-xs"
                  min={0}
                />
              </PropertyRow>
            )}
            <PropertyRow label="Format">
              <Select
                value={element.format}
                onValueChange={(v) => update({ format: v as CountdownFormat })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mm:ss">MM:SS</SelectItem>
                  <SelectItem value="hh:mm:ss">HH:MM:SS</SelectItem>
                  <SelectItem value="minutes">Minutes</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem] text-muted-foreground">
                Overtime
              </span>
              <Switch
                checked={element.overtime ?? false}
                onCheckedChange={(v) => update({ overtime: v })}
              />
            </div>
          </div>

          <Separator />

          {/* Urgency thresholds */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Urgency (seconds left)
            </span>
            <PropertyRow label="Warn">
              <Input
                type="number"
                value={element.warnSeconds ?? ""}
                onChange={(e) =>
                  update({ warnSeconds: parseThreshold(e.target.value) })
                }
                className="h-7 text-xs"
                min={0}
                placeholder="off"
              />
            </PropertyRow>
            <PropertyRow label="Danger">
              <Input
                type="number"
                value={element.dangerSeconds ?? ""}
                onChange={(e) =>
                  update({ dangerSeconds: parseThreshold(e.target.value) })
                }
                className="h-7 text-xs"
                min={0}
                placeholder="off"
              />
            </PropertyRow>
          </div>

          <Separator />

          {/* Typography */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Text
            </span>
            <PropertyRow label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.color}
                  onChange={(e) => update({ color: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-border"
                />
                <Input
                  value={element.color}
                  onChange={(e) => update({ color: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
              </div>
            </PropertyRow>
            <PropertyRow label="Size">
              <Slider
                value={[element.fontSize]}
                onValueChange={([v]) => update({ fontSize: v })}
                min={12}
                max={320}
                step={2}
              />
            </PropertyRow>
            <PropertyRow label="Weight">
              <Select
                value={String(element.fontWeight)}
                onValueChange={(v) => update({ fontWeight: Number(v) })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="400">Regular</SelectItem>
                  <SelectItem value="600">Semibold</SelectItem>
                  <SelectItem value="700">Bold</SelectItem>
                  <SelectItem value="900">Black</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
            <PropertyRow label="Align">
              <Select
                value={element.horizontalAlign}
                onValueChange={(v) =>
                  update({
                    horizontalAlign:
                      v as SlideTimerElement["horizontalAlign"],
                  })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="center">Center</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </PropertyRow>
          </div>

          <Separator />

          <ShadowSection
            shadow={element.shadow}
            onChange={(shadow) => update({ shadow })}
          />

          <Separator />

          <OutlineSection
            outline={element.outline}
            onChange={(outline) => update({ outline })}
          />

          <Separator />

          <PositionSizeSection rect={element} onChange={update} />

          <ElementAnimationProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
