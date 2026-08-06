import { useMemo, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  FilmIcon,
  TypeIcon,
  ScrollTextIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field-group"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { useBroadcastStore, type BroadcastProp } from "@/stores/broadcast-store"
import { FontFamilyPicker } from "@/components/shared/font-family-picker"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { pickImageFile, pickVideoFile } from "@/lib/theme-designer-files"
import { cn } from "@/lib/utils"

type SidebarSelection =
  { kind: "prop"; id: string } | { kind: "media-layer" } | null

export function PropsManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const props = useBroadcastStore((s) => s.props)
  const mediaLayer = useBroadcastStore((s) => s.mediaLayer)
  const [selection, setSelection] = useState<SidebarSelection>(null)

  const selected =
    selection?.kind === "prop" ? props.find((p) => p.id === selection.id) : null

  const handleCreate = (type: "text" | "image" | "marquee") => {
    const layout = {
      text: { x: 5, y: 90, width: 90, height: 8 },
      marquee: { x: 0, y: 92, width: 100, height: 7 },
      image: { x: 75, y: 5, width: 20, height: 15 },
    }[type]
    const textStyle = {
      fontFamily: "Inter",
      fontSize: 32,
      fontWeight: 600,
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.7)",
    }
    const prop: BroadcastProp = {
      id: crypto.randomUUID(),
      name:
        type === "text"
          ? "Text Overlay"
          : type === "marquee"
            ? "Marquee"
            : "Image Overlay",
      type,
      ...layout,
      active: false,
      ...(type === "text"
        ? { text: "Lower Third", ...textStyle }
        : type === "marquee"
          ? {
              text: "Welcome to our service — please silence your phones",
              ...textStyle,
              scrollSpeed: 120,
              scrollDirection: "left",
            }
          : { imageUrl: "", opacity: 1 }),
    }
    useBroadcastStore.getState().addProp(prop)
    setSelection({ kind: "prop", id: prop.id })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_1fr] overflow-hidden sm:max-h-[90vh] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Props & Layers</DialogTitle>
        </DialogHeader>

        <div
          className="flex min-h-0 gap-4"
          style={{ height: "min(70vh, 40rem)" }}
        >
          {/* Left: sidebar */}
          <div className="flex w-48 shrink-0 flex-col rounded-lg border border-border">
            {/* Media Layer section */}
            <div className="border-b border-border">
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                  Media Layer
                </span>
              </div>
              <div className="px-1 pb-1">
                <div
                  className={cn(
                    "group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                    selection?.kind === "media-layer"
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => setSelection({ kind: "media-layer" })}
                >
                  {mediaLayer ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-4 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          useBroadcastStore.getState().toggleMediaLayer()
                        }}
                        title={mediaLayer.active ? "Hide" : "Show"}
                      >
                        {mediaLayer.active ? (
                          <EyeIcon className="size-2.5 text-blue-500" />
                        ) : (
                          <EyeOffIcon className="size-2.5" />
                        )}
                      </Button>
                      <span
                        className={cn(
                          "flex-1 truncate",
                          !mediaLayer.active && "opacity-50"
                        )}
                      >
                        {mediaLayer.name}
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 truncate italic opacity-50">
                      None set
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Props section */}
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
                Props
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleCreate("text")}
                  title="Add text prop"
                >
                  <TypeIcon className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleCreate("marquee")}
                  title="Add scrolling marquee"
                >
                  <ScrollTextIcon className="size-3" />
                </Button>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-0.5 p-1">
                {props.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "group flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      selection?.kind === "prop" && selection.id === p.id
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    onClick={() => setSelection({ kind: "prop", id: p.id })}
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="size-4 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        useBroadcastStore.getState().toggleProp(p.id)
                      }}
                      title={p.active ? "Hide" : "Show"}
                    >
                      {p.active ? (
                        <EyeIcon className="size-2.5 text-green-500" />
                      ) : (
                        <EyeOffIcon className="size-2.5" />
                      )}
                    </Button>
                    <span
                      className={cn(
                        "flex-1 truncate",
                        !p.active && "opacity-50"
                      )}
                    >
                      {p.name}
                    </span>
                  </div>
                ))}
                {props.length === 0 && (
                  <p className="px-2 py-4 text-center text-[0.625rem] text-muted-foreground">
                    No props yet. Add a text or image overlay.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Right: editor */}
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {selection?.kind === "media-layer" ? (
              <MediaLayerEditor />
            ) : selected ? (
              <PropEditor prop={selected} />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-xs text-muted-foreground">
                  Select a prop or layer to edit
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MediaLayerEditor() {
  const mediaLayer = useBroadcastStore((s) => s.mediaLayer)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerType, setPickerType] = useState<"image" | "video">("image")

  const previewSrc = useMemo(() => {
    if (!mediaLayer) return null
    try {
      return convertFileSrc(mediaLayer.filePath)
    } catch {
      return mediaLayer.filePath
    }
  }, [mediaLayer])

  const handlePickFromDevice = async (type: "image" | "video") => {
    const path =
      type === "image" ? await pickImageFile() : await pickVideoFile()
    if (!path) return
    useBroadcastStore.getState().setMediaLayer({
      filePath: path,
      mediaType: type,
      name: path.split(/[\\/]/).pop() ?? (type === "image" ? "Image" : "Video"),
      active: true,
    })
  }

  return (
    <>
      <FieldGroup label="Background Media Layer">
        <p className="text-[0.625rem] text-muted-foreground">
          Persistent background that plays behind all slide and verse content.
          Set your verse theme or slide background to transparent to see it.
        </p>
      </FieldGroup>

      {/* Source selection */}
      <FieldGroup label="Source">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setPickerType("image")
              setPickerOpen(true)
            }}
          >
            <ImageIcon className="mr-1.5 size-3" />
            Image from Library
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setPickerType("video")
              setPickerOpen(true)
            }}
          >
            <FilmIcon className="mr-1.5 size-3" />
            Video from Library
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handlePickFromDevice("image")}
          >
            <ImageIcon className="mr-1.5 size-3" />
            Image from Device
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handlePickFromDevice("video")}
          >
            <FilmIcon className="mr-1.5 size-3" />
            Video from Device
          </Button>
        </div>
      </FieldGroup>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mediaType={pickerType}
        onSelect={(asset) => {
          useBroadcastStore.getState().setMediaLayer({
            filePath: asset.filePath,
            mediaType: asset.type as "image" | "video",
            name: asset.name,
            active: true,
          })
        }}
        onSelectFromDevice={(result) => {
          if (result.startsWith("data:")) return
          useBroadcastStore.getState().setMediaLayer({
            filePath: result,
            mediaType: pickerType,
            name: result.split(/[\\/]/).pop() ?? "Media",
            active: true,
          })
        }}
      />

      <Separator />

      {/* Preview */}
      <FieldGroup label="Preview">
        <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-black">
          {mediaLayer && previewSrc ? (
            mediaLayer.mediaType === "video" ? (
              <video
                key={mediaLayer.filePath}
                src={previewSrc}
                autoPlay
                muted
                loop
                playsInline
                className="size-full object-cover"
              />
            ) : (
              <img
                src={previewSrc}
                alt={mediaLayer.name}
                className="size-full object-cover"
              />
            )
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground/40">
              <ImageIcon className="size-8" />
              <span className="text-[0.625rem]">No media layer set</span>
            </div>
          )}
        </div>
      </FieldGroup>

      {/* Controls */}
      {mediaLayer && (
        <div className="flex items-center gap-2">
          <Button
            variant={mediaLayer.active ? "default" : "outline"}
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => useBroadcastStore.getState().toggleMediaLayer()}
          >
            {mediaLayer.active ? "On Air" : "Show"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 text-xs"
            onClick={() => useBroadcastStore.getState().setMediaLayer(null)}
          >
            <TrashIcon className="mr-1.5 size-3" />
            Remove
          </Button>
        </div>
      )}
    </>
  )
}

function PropEditor({ prop }: { prop: BroadcastProp }) {
  const update = (updates: Partial<BroadcastProp>) =>
    useBroadcastStore.getState().updateProp(prop.id, updates)

  return (
    <>
      <FieldGroup label="Name">
        <Input
          className="h-7 text-xs"
          value={prop.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </FieldGroup>

      {/* Position & size. Values are a percentage of the output; X/Y is the
          box's top-left corner. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <FieldGroup label="Left (X %)">
          <Input
            type="number"
            className="h-7 text-xs"
            value={prop.x}
            min={0}
            max={100}
            onChange={(e) => update({ x: Number(e.target.value) })}
          />
        </FieldGroup>
        <FieldGroup label="Top (Y %)">
          <Input
            type="number"
            className="h-7 text-xs"
            value={prop.y}
            min={0}
            max={100}
            onChange={(e) => update({ y: Number(e.target.value) })}
          />
        </FieldGroup>
        <FieldGroup label="Width %">
          <Input
            type="number"
            className="h-7 text-xs"
            value={prop.width}
            min={1}
            max={100}
            onChange={(e) => update({ width: Number(e.target.value) })}
          />
        </FieldGroup>
        <FieldGroup label="Height %">
          <Input
            type="number"
            className="h-7 text-xs"
            value={prop.height}
            min={1}
            max={100}
            onChange={(e) => update({ height: Number(e.target.value) })}
          />
        </FieldGroup>
      </div>

      <Separator />

      {(prop.type === "text" || prop.type === "marquee") && (
        <>
          <FieldGroup label={prop.type === "marquee" ? "Message" : "Text"}>
            <Input
              className="h-7 text-xs"
              value={prop.text ?? ""}
              onChange={(e) => update({ text: e.target.value })}
            />
          </FieldGroup>

          {prop.type === "marquee" && (
            <div className="grid grid-cols-2 gap-3">
              <FieldGroup label={`Speed (${prop.scrollSpeed ?? 120} px/s)`}>
                <Slider
                  value={[prop.scrollSpeed ?? 120]}
                  onValueChange={([v]) => update({ scrollSpeed: v })}
                  min={20}
                  max={400}
                  step={10}
                />
              </FieldGroup>
              <FieldGroup label="Direction">
                <select
                  className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
                  value={prop.scrollDirection ?? "left"}
                  onChange={(e) =>
                    update({
                      scrollDirection: e.target.value as "left" | "right",
                    })
                  }
                >
                  <option value="left">Right to left</option>
                  <option value="right">Left to right</option>
                </select>
              </FieldGroup>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Font">
              <FontFamilyPicker
                value={prop.fontFamily ?? "Inter"}
                onChange={(v) => update({ fontFamily: v })}
              />
            </FieldGroup>
            <FieldGroup label="Size">
              <Input
                type="number"
                className="h-7 text-xs"
                value={prop.fontSize ?? 32}
                min={8}
                max={200}
                onChange={(e) => update({ fontSize: Number(e.target.value) })}
              />
            </FieldGroup>
          </div>

          {prop.type === "text" && (
            <FieldGroup label="Alignment">
              <div className="flex gap-1">
                {(
                  [
                    ["left", AlignLeftIcon],
                    ["center", AlignCenterIcon],
                    ["right", AlignRightIcon],
                  ] as const
                ).map(([value, Icon]) => {
                  const active = (prop.textAlign ?? "center") === value
                  return (
                    <Button
                      key={value}
                      variant={active ? "default" : "outline"}
                      size="icon-sm"
                      className="size-7"
                      title={`Align ${value}`}
                      onClick={() => update({ textAlign: value })}
                    >
                      <Icon className="size-3.5" />
                    </Button>
                  )
                })}
              </div>
            </FieldGroup>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FieldGroup label="Text Color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="size-6 cursor-pointer rounded border border-border"
                  value={prop.color ?? "#ffffff"}
                  onChange={(e) => update({ color: e.target.value })}
                />
                <Input
                  className="h-7 flex-1 text-xs"
                  value={prop.color ?? "#ffffff"}
                  onChange={(e) => update({ color: e.target.value })}
                />
              </div>
            </FieldGroup>
            <FieldGroup label="Background">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="size-6 cursor-pointer rounded border border-border"
                  value={prop.backgroundColor ?? "#000000"}
                  onChange={(e) => update({ backgroundColor: e.target.value })}
                />
                <Input
                  className="h-7 flex-1 text-xs"
                  value={prop.backgroundColor ?? ""}
                  placeholder="none"
                  onChange={(e) =>
                    update({ backgroundColor: e.target.value || undefined })
                  }
                />
              </div>
            </FieldGroup>
          </div>

          <FieldGroup label="Font Weight">
            <select
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
              value={String(prop.fontWeight ?? 600)}
              onChange={(e) => update({ fontWeight: Number(e.target.value) })}
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra Bold</option>
            </select>
          </FieldGroup>
        </>
      )}

      {prop.type === "image" && (
        <>
          <FieldGroup label="Image URL">
            <Input
              className="h-7 text-xs"
              value={prop.imageUrl ?? ""}
              placeholder="Paste image URL or file path"
              onChange={(e) => update({ imageUrl: e.target.value })}
            />
          </FieldGroup>
          <FieldGroup label="Opacity">
            <Slider
              value={[prop.opacity ?? 1]}
              onValueChange={([v]) => update({ opacity: v })}
              min={0}
              max={1}
              step={0.05}
            />
          </FieldGroup>
        </>
      )}

      <Separator />

      {/* Preview */}
      <FieldGroup label="Preview">
        <div
          className="relative overflow-hidden rounded-md border border-border bg-black/80"
          style={{ height: 100 }}
        >
          <PropPreview prop={prop} />
        </div>
      </FieldGroup>

      <div className="flex items-center gap-2">
        <Button
          variant={prop.active ? "default" : "outline"}
          size="sm"
          className="h-7 flex-1 text-xs"
          onClick={() => useBroadcastStore.getState().toggleProp(prop.id)}
        >
          {prop.active ? "On Air" : "Show"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs"
          onClick={() => useBroadcastStore.getState().removeProp(prop.id)}
        >
          <TrashIcon className="mr-1.5 size-3" />
          Delete
        </Button>
      </div>
    </>
  )
}

function PropPreview({ prop }: { prop: BroadcastProp }) {
  if (prop.type === "marquee") {
    const text = prop.text || "Marquee"
    // Duration from authored px/s speed; scaled to the 100px-tall preview so the
    // apparent pace roughly tracks what goes live. Guard against 0-speed → ∞.
    const speed = Math.max(prop.scrollSpeed ?? 120, 1)
    const durationSec = (600 / speed) * 4
    const toLeft = (prop.scrollDirection ?? "left") === "left"
    return (
      <div
        className="absolute flex items-center overflow-hidden whitespace-nowrap"
        style={{
          left: `${prop.x}%`,
          top: `${prop.y}%`,
          width: `${prop.width}%`,
          height: `${prop.height}%`,
          backgroundColor: prop.backgroundColor,
          color: prop.color ?? "#ffffff",
          fontSize: Math.min((prop.fontSize ?? 32) * 0.35, 16),
          fontWeight: prop.fontWeight ?? 600,
          fontFamily: prop.fontFamily ?? "Inter",
        }}
      >
        <style>{`@keyframes prop-marquee-preview{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
        <div
          className="flex shrink-0"
          style={{
            animation: `prop-marquee-preview ${durationSec}s linear infinite`,
            animationDirection: toLeft ? "normal" : "reverse",
          }}
        >
          <span className="px-4">{text}</span>
          <span className="px-4">{text}</span>
        </div>
      </div>
    )
  }

  if (prop.type === "text") {
    const align = prop.textAlign ?? "center"
    return (
      <div
        className="absolute flex items-center px-1"
        style={{
          left: `${prop.x}%`,
          top: `${prop.y}%`,
          width: `${prop.width}%`,
          height: `${prop.height}%`,
          justifyContent:
            align === "left"
              ? "flex-start"
              : align === "right"
                ? "flex-end"
                : "center",
          backgroundColor: prop.backgroundColor,
          color: prop.color ?? "#ffffff",
          fontSize: Math.min((prop.fontSize ?? 32) * 0.35, 16),
          fontWeight: prop.fontWeight ?? 600,
          fontFamily: prop.fontFamily ?? "Inter",
          textAlign: align,
        }}
      >
        {prop.text}
      </div>
    )
  }

  if (prop.type === "image" && prop.imageUrl) {
    return (
      <img
        src={prop.imageUrl}
        alt=""
        className="absolute object-contain"
        style={{
          left: `${prop.x}%`,
          top: `${prop.y}%`,
          width: `${prop.width}%`,
          height: `${prop.height}%`,
          opacity: prop.opacity ?? 1,
        }}
      />
    )
  }

  return null
}
