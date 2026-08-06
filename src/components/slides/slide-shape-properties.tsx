import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import {
  ElementAnimationProperties,
  ShapeMaskProperties,
} from "@/components/slides/element-animation-properties"
import type { SlideShapeElement } from "@/types/slide"

function PropertyRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export function SlideShapeProperties({
  element,
}: {
  element: SlideShapeElement
}) {
  const draft = usePresentationStore((s) => s.draftPresentation)
  const activeSlideIndex = usePresentationStore((s) => s.activeSlideIndex)
  const activeSlide = draft?.slides[activeSlideIndex]
  const elements = activeSlide?.elements ?? []

  const update = (updates: Partial<SlideShapeElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const shadow = element.shadow ?? {
    offsetX: 2,
    offsetY: 2,
    blur: 4,
    color: "rgba(0,0,0,0.5)",
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Shape Properties"
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Fill */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Fill
            </span>
            <PropertyRow label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    element.fillColor.startsWith("rgba")
                      ? "#ffffff"
                      : element.fillColor
                  }
                  onChange={(e) => update({ fillColor: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-border"
                />
                <Input
                  value={element.fillColor}
                  onChange={(e) => update({ fillColor: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
              </div>
            </PropertyRow>
            <PropertyRow label="Opacity">
              <Slider
                value={[element.opacity]}
                onValueChange={([v]) => update({ opacity: v })}
                min={0}
                max={1}
                step={0.05}
              />
            </PropertyRow>
          </div>

          <Separator />

          {/* Stroke */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Stroke
            </span>
            <PropertyRow label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.strokeColor}
                  onChange={(e) => update({ strokeColor: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-border"
                />
                <Input
                  value={element.strokeColor}
                  onChange={(e) => update({ strokeColor: e.target.value })}
                  className="h-7 flex-1 text-xs"
                />
              </div>
            </PropertyRow>
            <PropertyRow label="Width">
              <Slider
                value={[element.strokeWidth]}
                onValueChange={([v]) => update({ strokeWidth: v })}
                min={0}
                max={20}
                step={1}
              />
            </PropertyRow>
          </div>

          <Separator />

          {/* Border Radius (only for rounded-rect) */}
          {element.shapeType === "rounded-rect" && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  Corner Radius
                </span>
                <PropertyRow label="Radius">
                  <Slider
                    value={[element.borderRadius]}
                    onValueChange={([v]) => update({ borderRadius: v })}
                    min={0}
                    max={100}
                    step={1}
                  />
                </PropertyRow>
              </div>
              <Separator />
            </>
          )}

          {/* Shadow */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Shadow
              </span>
              <Button
                variant={element.shadow ? "default" : "outline"}
                size="icon-sm"
                className="size-5 text-[0.5625rem]"
                aria-label="Shadow"
                aria-pressed={!!element.shadow}
                onClick={() =>
                  update({
                    shadow: element.shadow
                      ? undefined
                      : {
                          offsetX: 2,
                          offsetY: 2,
                          blur: 8,
                          color: "rgba(0,0,0,0.4)",
                        },
                  })
                }
              >
                {element.shadow ? "On" : "Off"}
              </Button>
            </div>
            {element.shadow && (
              <>
                <PropertyRow label="Offset X">
                  <Slider
                    value={[shadow.offsetX]}
                    onValueChange={([v]) =>
                      update({ shadow: { ...shadow, offsetX: v } })
                    }
                    min={-20}
                    max={20}
                    step={1}
                  />
                </PropertyRow>
                <PropertyRow label="Offset Y">
                  <Slider
                    value={[shadow.offsetY]}
                    onValueChange={([v]) =>
                      update({ shadow: { ...shadow, offsetY: v } })
                    }
                    min={-20}
                    max={20}
                    step={1}
                  />
                </PropertyRow>
                <PropertyRow label="Blur">
                  <Slider
                    value={[shadow.blur]}
                    onValueChange={([v]) =>
                      update({ shadow: { ...shadow, blur: v } })
                    }
                    min={0}
                    max={50}
                    step={1}
                  />
                </PropertyRow>
                <PropertyRow label="Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={
                        shadow.color.startsWith("rgba")
                          ? "#000000"
                          : shadow.color
                      }
                      onChange={(e) =>
                        update({ shadow: { ...shadow, color: e.target.value } })
                      }
                      className="size-7 cursor-pointer rounded border border-border"
                    />
                    <Input
                      value={shadow.color}
                      onChange={(e) =>
                        update({ shadow: { ...shadow, color: e.target.value } })
                      }
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                </PropertyRow>
              </>
            )}
          </div>

          <Separator />

          {/* Position & Size */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Position & Size (%)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <PropertyRow label="X">
                <Input
                  type="number"
                  value={element.x}
                  onChange={(e) => update({ x: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={0}
                  max={100}
                />
              </PropertyRow>
              <PropertyRow label="Y">
                <Input
                  type="number"
                  value={element.y}
                  onChange={(e) => update({ y: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={0}
                  max={100}
                />
              </PropertyRow>
              <PropertyRow label="W">
                <Input
                  type="number"
                  value={element.width}
                  onChange={(e) => update({ width: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={1}
                  max={100}
                />
              </PropertyRow>
              <PropertyRow label="H">
                <Input
                  type="number"
                  value={element.height}
                  onChange={(e) => update({ height: Number(e.target.value) })}
                  className="h-7 text-xs"
                  min={1}
                  max={100}
                />
              </PropertyRow>
            </div>
          </div>

          <ShapeMaskProperties element={element} elements={elements} />
          <ElementAnimationProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
