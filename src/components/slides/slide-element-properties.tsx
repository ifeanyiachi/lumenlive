import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { ColorSwatch } from "@/components/ui/color-swatch"
import { Textarea } from "@/components/ui/textarea"
import { Slider } from "@/components/ui/slider"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import {
  ElementAnimationProperties,
  TextBuildProperties,
  ScrollingTextProperties,
} from "@/components/slides/element-animation-properties"
import {
  PropertyRow,
  ShadowSection,
  OutlineSection,
  PositionSizeSection,
} from "@/components/slides/element-property-sections"
import type { SlideTextElement } from "@/types/slide"

export function SlideElementProperties({
  element,
}: {
  element: SlideTextElement
}) {
  const update = (updates: Partial<SlideTextElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <PanelHeader
        title="Properties"
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-4 p-3">
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

          {/* Background */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Background
            </span>
            <PropertyRow label="Color">
              <div className="flex items-center gap-2">
                <ColorSwatch
                  value={element.backgroundColor ?? "#000000"}
                  onChange={(backgroundColor) => update({ backgroundColor })}
                  className="size-7"
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

          <PositionSizeSection rect={element} onChange={update} />

          <ElementAnimationProperties element={element} />
          <TextBuildProperties element={element} />
          <ScrollingTextProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
