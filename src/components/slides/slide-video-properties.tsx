import { useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsIcon, VideoIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import { ElementAnimationProperties } from "@/components/slides/element-animation-properties"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import type { SlideVideoElement } from "@/types/slide"
import type { MediaAsset } from "@/types/media"

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

export function SlideVideoProperties({
  element,
}: {
  element: SlideVideoElement
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const update = (updates: Partial<SlideVideoElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const handleSelectAsset = (asset: MediaAsset) => {
    const url = safeFileSrc(asset.filePath)
    update({ videoUrl: url })
  }

  const handleSelectFromDevice = (dataUrl: string) => {
    update({ videoUrl: dataUrl })
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Video Properties"
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Video source */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Video
            </span>
            {element.videoUrl ? (
              <div className="flex flex-col gap-2">
                <div className="relative aspect-video w-full overflow-hidden rounded border border-border bg-muted">
                  <video
                    src={element.videoUrl}
                    className="size-full object-contain"
                    muted
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setPickerOpen(true)}
                  >
                    <VideoIcon className="mr-1.5 size-3" />
                    Replace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => update({ videoUrl: "" })}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setPickerOpen(true)}
              >
                <VideoIcon className="mr-1.5 size-3" />
                Choose Video
              </Button>
            )}
          </div>

          <MediaPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            mediaType="video"
            onSelect={(asset) => handleSelectAsset(asset)}
            onSelectFromDevice={(result) => handleSelectFromDevice(result)}
          />

          <Separator />

          {/* Playback */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Playback
            </span>
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem] text-muted-foreground">
                Muted
              </span>
              <Switch
                checked={element.muted}
                onCheckedChange={(v) => update({ muted: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[0.6875rem] text-muted-foreground">
                Loop
              </span>
              <Switch
                checked={element.loop}
                onCheckedChange={(v) => update({ loop: v })}
              />
            </div>
          </div>

          <Separator />

          {/* Display */}
          <div className="flex flex-col gap-2">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Display
            </span>
            <PropertyRow label="Fit">
              <Select
                value={element.objectFit}
                onValueChange={(v) =>
                  update({ objectFit: v as SlideVideoElement["objectFit"] })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">Cover</SelectItem>
                  <SelectItem value="contain">Contain</SelectItem>
                  <SelectItem value="fill">Fill</SelectItem>
                </SelectContent>
              </Select>
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
        </div>
      </ScrollArea>
    </div>
  )
}
