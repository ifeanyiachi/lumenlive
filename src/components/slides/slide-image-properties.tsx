import { useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { PanelHeader } from "@/components/ui/panel-header"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { SettingsIcon, ImageIcon } from "lucide-react"
import { usePresentationStore } from "@/stores/presentation-store"
import { preloadSlideImage } from "@/lib/slide-image-cache"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { ElementAnimationProperties } from "@/components/slides/element-animation-properties"
import { PositionSizeSection } from "@/components/slides/element-property-sections"
import type { SlideImageElement } from "@/types/slide"
import type { MediaAsset } from "@/types/media"

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

          <PositionSizeSection rect={element} onChange={update} />

          <ElementAnimationProperties element={element} />
        </div>
      </ScrollArea>
    </div>
  )
}
