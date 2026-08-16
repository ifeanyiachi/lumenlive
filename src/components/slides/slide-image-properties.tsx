import { useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { PanelHeader } from "@/components/ui/panel-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon, ImageIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import { preloadSlideImage } from "@/lib/slide-image-cache"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { ElementAnimationProperties } from "@/components/slides/element-animation-properties"
import type { SlideImageElement } from "@/types/slide"
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

export function SlideImageProperties({
  element,
}: {
  element: SlideImageElement
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  const update = (updates: Partial<SlideImageElement>) => {
    usePresentationStore.getState().updateDraftElement(element.id, updates)
  }

  const handleSelectAsset = async (asset: MediaAsset) => {
    const url = safeFileSrc(asset.filePath)
    await preloadSlideImage(url)
    update({ imageUrl: url })
  }

  const handleSelectFromDevice = async (dataUrl: string) => {
    await preloadSlideImage(dataUrl)
    update({ imageUrl: dataUrl })
  }

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="Image Properties"
        icon={<SettingsIcon className="size-3.5" />}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {/* Image source */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
              Image
            </span>
            {element.imageUrl ? (
              <div className="flex flex-col gap-2">
                <div className="relative aspect-video w-full overflow-hidden rounded border border-border bg-muted">
                  <img
                    src={element.imageUrl}
                    alt=""
                    className="size-full object-contain"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => setPickerOpen(true)}
                  >
                    <ImageIcon className="mr-1.5 size-3" />
                    Replace
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive"
                    onClick={() => update({ imageUrl: "" })}
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
                <ImageIcon className="mr-1.5 size-3" />
                Choose Image
              </Button>
            )}
          </div>

          <MediaPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            mediaType="image"
            onSelect={(asset) => void handleSelectAsset(asset)}
            onSelectFromDevice={(result) => void handleSelectFromDevice(result)}
          />

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
