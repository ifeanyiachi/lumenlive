import { useBroadcastStore } from "@/stores/broadcast-store"
import { useMediaStore } from "@/stores/media-store"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ImageIcon } from "lucide-react"
import type { ThemeElement } from "@/types/broadcast"
import type { CanvasSizeMode } from "@/types/canvas"
import {
  AnchorPicker,
  type AnchorPosition,
} from "@/components/shared/anchor-picker"
import { deriveElementAnchor } from "@/lib/verse-renderer/project-element"
import { open } from "@tauri-apps/plugin-dialog"
import { convertFileSrc } from "@tauri-apps/api/core"

function getElementIndex(elements: ThemeElement[], id: string): number {
  return elements.findIndex((e) => e.id === id)
}

export function ElementProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const selectedElement = useBroadcastStore((s) => s.selectedElement)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !selectedElement) return null
  if (selectedElement === "verse" || selectedElement === "reference")
    return null

  const elements = draftTheme.elements ?? []
  const el = elements.find((e) => e.id === selectedElement)
  if (!el) return null

  const idx = getElementIndex(elements, el.id)
  const prefix = `elements.${idx}`

  const handlePickImage = async () => {
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
        },
      ],
    })
    if (path) {
      update(`${prefix}.image.url`, convertFileSrc(path as string))
      void useMediaStore.getState().importPaths([path as string])
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5 pb-1">
        <h4 className="text-xs font-semibold">
          {el.type === "image" ? "Image" : "Shape"} Properties
        </h4>
        <p className="text-[11px] text-muted-foreground">
          Configure the selected element
        </p>
      </div>

      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Name
        </label>
        <Input
          value={el.name}
          onChange={(e) => update(`${prefix}.name`, e.target.value)}
          className="h-8 text-xs"
        />
      </div>

      {/* Position */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">X</label>
          <Input
            type="number"
            value={el.x}
            onChange={(e) => update(`${prefix}.x`, Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Y</label>
          <Input
            type="number"
            value={el.y}
            onChange={(e) => update(`${prefix}.y`, Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Size */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Width
          </label>
          <Input
            type="number"
            value={el.width}
            onChange={(e) =>
              update(`${prefix}.width`, Math.max(1, Number(e.target.value)))
            }
            className="h-8 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Height
          </label>
          <Input
            type="number"
            value={el.height}
            onChange={(e) =>
              update(`${prefix}.height`, Math.max(1, Number(e.target.value)))
            }
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Reflow anchor — where this element pins when the live output renders at
          a non-16:9 resolution. No effect in the 1920×1080 editor. */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Reflow anchor
        </label>
        <div className="flex items-center gap-3">
          <AnchorPicker
            value={
              (el.anchor ??
                deriveElementAnchor(el, draftTheme.resolution)) as AnchorPosition
            }
            onChange={(anchor) => update(`${prefix}.anchor`, anchor)}
          />
          <div className="flex flex-1 flex-col gap-1.5">
            <Select
              value={el.sizeMode ?? "proportional"}
              onValueChange={(v) =>
                update(`${prefix}.sizeMode`, v as CanvasSizeMode)
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proportional">Scale with screen</SelectItem>
                <SelectItem value="fixed">Fixed size</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Pins this element on non-16:9 output. Editing stays at 1920×1080.
            </p>
          </div>
        </div>
      </div>

      {/* Image-specific properties */}
      {el.type === "image" && el.image && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Image Source
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-8 justify-start gap-2 text-xs"
              onClick={handlePickImage}
            >
              <ImageIcon className="size-3.5" />
              {el.image.url ? "Change Image" : "Choose Image"}
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Fit
            </label>
            <Select
              value={el.image.fit}
              onValueChange={(v) => update(`${prefix}.image.fit`, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cover">Cover</SelectItem>
                <SelectItem value="contain">Contain</SelectItem>
                <SelectItem value="stretch">Stretch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Opacity
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(el.image.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(el.image.opacity * 100)]}
              onValueChange={([v]) =>
                update(`${prefix}.image.opacity`, v / 100)
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Border Radius
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {el.image.borderRadius}px
              </span>
            </div>
            <Slider
              min={0}
              max={200}
              step={1}
              value={[el.image.borderRadius]}
              onValueChange={([v]) => update(`${prefix}.image.borderRadius`, v)}
            />
          </div>
        </>
      )}

      {/* Shape-specific properties */}
      {el.type === "shape" && el.shape && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Shape
            </label>
            <Select
              value={el.shape.shapeType}
              onValueChange={(v) => update(`${prefix}.shape.shapeType`, v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rectangle">Rectangle</SelectItem>
                <SelectItem value="rounded-rect">Rounded Rectangle</SelectItem>
                <SelectItem value="circle">Circle / Ellipse</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Fill Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={el.shape.fillColor}
                onChange={(e) =>
                  update(`${prefix}.shape.fillColor`, e.target.value)
                }
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border"
              />
              <Input
                value={el.shape.fillColor}
                onChange={(e) =>
                  update(`${prefix}.shape.fillColor`, e.target.value)
                }
                className="h-8 flex-1 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Fill Opacity
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(el.shape.fillOpacity * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(el.shape.fillOpacity * 100)]}
              onValueChange={([v]) =>
                update(`${prefix}.shape.fillOpacity`, v / 100)
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Stroke Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={el.shape.strokeColor}
                onChange={(e) =>
                  update(`${prefix}.shape.strokeColor`, e.target.value)
                }
                className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border"
              />
              <Input
                value={el.shape.strokeColor}
                onChange={(e) =>
                  update(`${prefix}.shape.strokeColor`, e.target.value)
                }
                className="h-8 flex-1 text-xs"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Stroke Width
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {el.shape.strokeWidth}px
              </span>
            </div>
            <Slider
              min={0}
              max={20}
              step={1}
              value={[el.shape.strokeWidth]}
              onValueChange={([v]) => update(`${prefix}.shape.strokeWidth`, v)}
            />
          </div>

          {el.shape.shapeType === "rounded-rect" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Border Radius
                </label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {el.shape.borderRadius}px
                </span>
              </div>
              <Slider
                min={0}
                max={200}
                step={1}
                value={[el.shape.borderRadius]}
                onValueChange={([v]) =>
                  update(`${prefix}.shape.borderRadius`, v)
                }
              />
            </div>
          )}

          {/* Mask target */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Mask Target
            </label>
            <Select
              value={el.maskTargetId ?? "__none__"}
              onValueChange={(v) =>
                update(
                  `${prefix}.maskTargetId`,
                  v === "__none__" ? undefined : v
                )
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                <SelectItem value="textArea">Text Area</SelectItem>
                <SelectItem value="verse">Verse</SelectItem>
                <SelectItem value="reference">Reference</SelectItem>
                {elements
                  .filter(
                    (e) =>
                      e.id !== el.id && !(e.type === "shape" && e.maskTargetId)
                  )
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Clips the target element to this shape
            </p>
          </div>
        </>
      )}
    </div>
  )
}
