import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import {
  ElementAnimationProperties,
  TextBuildProperties,
  ScrollingTextProperties,
} from "@/components/slides/element-animation-properties"
import type { SlideTextElement } from "@/types/slide"

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

export function SlideElementProperties({
  element,
}: {
  element: SlideTextElement
}) {
  const update = (updates: Partial<SlideTextElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const shadow = element.shadow ?? {
    offsetX: 2,
    offsetY: 2,
    blur: 4,
    color: "rgba(0,0,0,0.5)",
  }
  const outline = element.outline ?? { width: 0, color: "#000000" }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Properties"
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Text content */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Text
            </span>
            <Textarea
              value={element.text}
              onChange={(e) => update({ text: e.target.value })}
              className="min-h-20 text-xs"
              placeholder="Enter text..."
            />
          </div>

          <Separator />

          {/* Spacing */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Spacing
            </span>
            <PropertyRow label="Line Height">
              <Slider
                value={[element.lineHeight]}
                onValueChange={([v]) => update({ lineHeight: v })}
                min={0.8}
                max={2.5}
                step={0.1}
              />
            </PropertyRow>
            <PropertyRow label="Letter Spacing">
              <Slider
                value={[element.letterSpacing ?? 0]}
                onValueChange={([v]) => update({ letterSpacing: v })}
                min={-5}
                max={50}
                step={0.5}
              />
            </PropertyRow>
          </div>

          <Separator />

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
                onClick={() =>
                  update({
                    shadow: element.shadow
                      ? undefined
                      : {
                          offsetX: 2,
                          offsetY: 2,
                          blur: 4,
                          color: "rgba(0,0,0,0.5)",
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

          {/* Outline */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Outline
              </span>
              <Button
                variant={
                  element.outline && element.outline.width > 0
                    ? "default"
                    : "outline"
                }
                size="icon-sm"
                className="size-5 text-[0.5625rem]"
                onClick={() =>
                  update({
                    outline:
                      element.outline && element.outline.width > 0
                        ? undefined
                        : { width: 2, color: "#000000" },
                  })
                }
              >
                {element.outline && element.outline.width > 0 ? "On" : "Off"}
              </Button>
            </div>
            {element.outline && element.outline.width > 0 && (
              <>
                <PropertyRow label="Width">
                  <Slider
                    value={[outline.width]}
                    onValueChange={([v]) =>
                      update({ outline: { ...outline, width: v } })
                    }
                    min={1}
                    max={20}
                    step={1}
                  />
                </PropertyRow>
                <PropertyRow label="Color">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={outline.color}
                      onChange={(e) =>
                        update({
                          outline: { ...outline, color: e.target.value },
                        })
                      }
                      className="size-7 cursor-pointer rounded border border-border"
                    />
                    <Input
                      value={outline.color}
                      onChange={(e) =>
                        update({
                          outline: { ...outline, color: e.target.value },
                        })
                      }
                      className="h-7 flex-1 text-xs"
                    />
                  </div>
                </PropertyRow>
              </>
            )}
          </div>

          <Separator />

          {/* Background */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Background
            </span>
            <PropertyRow label="Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={element.backgroundColor ?? "#000000"}
                  onChange={(e) => update({ backgroundColor: e.target.value })}
                  className="size-7 cursor-pointer rounded border border-border"
                />
                <Input
                  value={element.backgroundColor ?? ""}
                  onChange={(e) =>
                    update({ backgroundColor: e.target.value || undefined })
                  }
                  className="h-7 flex-1 text-xs"
                  placeholder="None"
                />
                {element.backgroundColor && (
                  <button
                    type="button"
                    className="shrink-0 text-[0.625rem] text-muted-foreground hover:text-foreground"
                    onClick={() => update({ backgroundColor: undefined })}
                  >
                    Clear
                  </button>
                )}
              </div>
            </PropertyRow>
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

          <ElementAnimationProperties element={element} />
          <TextBuildProperties element={element} />
          <ScrollingTextProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
