import { useState } from "react"
import { safeFileSrc } from "@/lib/media/safe-file-src"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { usePresentationStore } from "@/stores/presentation-store"
import { MediaPickerDialog } from "@/components/media/media-picker-dialog"
import { preloadSlideImage } from "@/lib/slide-image-cache"
import {
  GradientControls as SharedGradientControls,
  SolidControls as SharedSolidControls,
} from "@/components/shared/gradient-controls"
import type { GradientValue } from "@/components/shared/gradient-controls"
import type { SlideBackground } from "@/types/slide"
import type { MediaAsset } from "@/types/media"
import { ImageIcon, FilmIcon, XIcon } from "lucide-react"
import { BackgroundMediaLibrary } from "@/components/slides/background-media-library"

function parseTintColor(tint: string): { hex: string; opacity: number } {
  if (tint.length === 9 && tint.startsWith("#")) {
    const alpha = parseInt(tint.slice(7, 9), 16) / 255
    return { hex: tint.slice(0, 7), opacity: Math.round(alpha * 100) }
  }
  return { hex: tint || "#000000", opacity: 50 }
}

function buildTint(hex: string, opacity: number): string {
  const alpha = Math.round((opacity / 100) * 255)
  return hex.slice(0, 7) + alpha.toString(16).padStart(2, "0")
}

export function SlideBackgroundProperties() {
  const activeSlide = usePresentationStore(
    (s) => s.draftPresentation?.slides[s.activeSlideIndex] ?? null
  )

  if (!activeSlide) return null

  const bg = activeSlide.background

  const update = (background: SlideBackground) => {
    usePresentationStore.getState().updateDraftSlide({ background })
  }

  const setType = (type: SlideBackground["type"]) => {
    switch (type) {
      case "solid":
        update({ type: "solid", color: bg.color ?? "#1a1a2e" })
        break
      case "gradient":
        update({
          type: "gradient",
          gradient: bg.gradient ?? {
            type: "linear",
            angle: 180,
            stops: [
              { offset: 0, color: "#0f0c29" },
              { offset: 1, color: "#302b63" },
            ],
          },
        })
        break
      case "image":
        update({
          type: "image",
          imageUrl: bg.imageUrl ?? "",
          brightness: bg.brightness ?? 1,
        })
        break
      case "video":
        update({
          type: "video",
          videoUrl: bg.videoUrl ?? "",
          brightness: bg.brightness ?? 1,
        })
        break
      case "transparent":
        update({ type: "transparent" })
        break
    }
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <span className="text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase">
        Background
      </span>

      <div className="flex flex-col gap-1.5">
        <label className="text-[0.6875rem] text-muted-foreground">Type</label>
        <Select
          value={bg.type}
          onValueChange={(v) => setType(v as SlideBackground["type"])}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid Color</SelectItem>
            <SelectItem value="gradient">Gradient</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="video">Video</SelectItem>
            <SelectItem value="transparent">Transparent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <BackgroundMediaLibrary
        onApplyImage={(url) =>
          update({ type: "image", imageUrl: url, brightness: 1 })
        }
        onApplyVideo={(url) =>
          update({ type: "video", videoUrl: url, brightness: 1 })
        }
      />

      {bg.type === "solid" && <SolidControls bg={bg} onUpdate={update} />}
      {bg.type === "gradient" && <GradientControls bg={bg} onUpdate={update} />}
      {bg.type === "image" && <ImageControls bg={bg} onUpdate={update} />}
      {bg.type === "video" && <VideoControls bg={bg} onUpdate={update} />}
      {bg.type === "transparent" && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Transparent background for overlay mode.
        </p>
      )}
    </div>
  )
}

function SolidControls({
  bg,
  onUpdate,
}: {
  bg: SlideBackground
  onUpdate: (bg: SlideBackground) => void
}) {
  return (
    <SharedSolidControls
      color={bg.color ?? "#1a1a2e"}
      onChange={(color) => onUpdate({ ...bg, color })}
    />
  )
}

function toSharedGradient(
  gradient: NonNullable<SlideBackground["gradient"]>
): GradientValue {
  return {
    type: gradient.type,
    angle: gradient.angle ?? 180,
    stops: gradient.stops.map((s) => ({
      color: s.color,
      position: s.offset * 100,
    })),
  }
}

function fromSharedGradient(
  g: GradientValue
): NonNullable<SlideBackground["gradient"]> {
  return {
    type: g.type,
    angle: g.angle,
    stops: g.stops.map((s) => ({ color: s.color, offset: s.position / 100 })),
  }
}

function GradientControls({
  bg,
  onUpdate,
}: {
  bg: SlideBackground
  onUpdate: (bg: SlideBackground) => void
}) {
  const gradient = bg.gradient ?? {
    type: "linear" as const,
    angle: 180,
    stops: [
      { offset: 0, color: "#0f0c29" },
      { offset: 1, color: "#302b63" },
    ],
  }

  return (
    <SharedGradientControls
      gradient={toSharedGradient(gradient)}
      onUpdate={(g) => onUpdate({ ...bg, gradient: fromSharedGradient(g) })}
    />
  )
}

function ImageControls({
  bg,
  onUpdate,
}: {
  bg: SlideBackground
  onUpdate: (bg: SlideBackground) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const hasImage = !!bg.imageUrl

  const handleSelectAsset = async (asset: MediaAsset) => {
    const dataUrl = safeFileSrc(asset.filePath)
    await preloadSlideImage(dataUrl)
    onUpdate({ ...bg, imageUrl: dataUrl, mediaAssetId: asset.id })
  }

  const handleSelectFromDevice = async (dataUrl: string) => {
    await preloadSlideImage(dataUrl)
    onUpdate({ ...bg, imageUrl: dataUrl, mediaAssetId: undefined })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {hasImage && (
        <div
          className="relative h-20 w-full overflow-hidden rounded border border-border bg-cover bg-center"
          style={{ backgroundImage: `url(${bg.imageUrl})` }}
        >
          <button
            type="button"
            onClick={() =>
              onUpdate({ ...bg, imageUrl: "", mediaAssetId: undefined })
            }
            className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80"
            title="Remove image"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => setPickerOpen(true)}
      >
        <ImageIcon className="mr-1.5 size-3" />
        {hasImage ? "Change Image" : "Choose Image"}
      </Button>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mediaType="image"
        onSelect={(asset) => void handleSelectAsset(asset)}
        onSelectFromDevice={(result) => void handleSelectFromDevice(result)}
      />

      {hasImage && (
        <>
          {/* Brightness */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[0.6875rem] text-muted-foreground">
                Brightness
              </label>
              <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                {Math.round((bg.brightness ?? 1) * 100)}%
              </span>
            </div>
            <Slider
              value={[(bg.brightness ?? 1) * 100]}
              onValueChange={([v]) => onUpdate({ ...bg, brightness: v / 100 })}
              min={0}
              max={200}
              step={1}
            />
          </div>

          {/* Blur */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[0.6875rem] text-muted-foreground">
                Blur
              </label>
              <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                {bg.blur ?? 0}px
              </span>
            </div>
            <Slider
              value={[bg.blur ?? 0]}
              onValueChange={([v]) => onUpdate({ ...bg, blur: v })}
              min={0}
              max={50}
              step={1}
            />
          </div>

          {/* Color Tint Overlay */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
              <input
                type="checkbox"
                checked={!!bg.tint}
                onChange={(e) =>
                  onUpdate({
                    ...bg,
                    tint: e.target.checked
                      ? buildTint("#000000", 50)
                      : undefined,
                  })
                }
                className="size-3.5 rounded border-border accent-primary"
              />
              Color Overlay
            </label>
            {bg.tint &&
              (() => {
                const { hex: tintHex, opacity: tintOpacity } = parseTintColor(
                  bg.tint
                )
                return (
                  <div className="flex flex-col gap-1.5 pl-5">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={tintHex}
                        onChange={(e) =>
                          onUpdate({
                            ...bg,
                            tint: buildTint(e.target.value, tintOpacity),
                          })
                        }
                        className="size-7 cursor-pointer rounded border border-border"
                      />
                      <Input
                        value={tintHex}
                        onChange={(e) => {
                          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                            onUpdate({
                              ...bg,
                              tint: buildTint(e.target.value, tintOpacity),
                            })
                        }}
                        className="h-7 flex-1 text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[0.6875rem] text-muted-foreground">
                        Opacity
                      </label>
                      <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                        {tintOpacity}%
                      </span>
                    </div>
                    <Slider
                      value={[tintOpacity]}
                      onValueChange={([v]) =>
                        onUpdate({ ...bg, tint: buildTint(tintHex, v) })
                      }
                      min={0}
                      max={100}
                      step={1}
                    />
                  </div>
                )
              })()}
          </div>
        </>
      )}
    </div>
  )
}

function VideoControls({
  bg,
  onUpdate,
}: {
  bg: SlideBackground
  onUpdate: (bg: SlideBackground) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const hasVideo = !!bg.videoUrl

  const handleSelectAsset = (asset: MediaAsset) => {
    const url = safeFileSrc(asset.filePath)
    onUpdate({ ...bg, videoUrl: url, mediaAssetId: asset.id })
  }

  const handleSelectFromDevice = (filePath: string) => {
    const url = safeFileSrc(filePath)
    onUpdate({ ...bg, videoUrl: url, mediaAssetId: undefined })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {hasVideo && (
        <div className="relative h-20 w-full overflow-hidden rounded border border-border bg-muted">
          <video
            src={bg.videoUrl}
            muted
            autoPlay
            loop
            playsInline
            className="size-full object-cover"
          />
          <button
            type="button"
            onClick={() =>
              onUpdate({ ...bg, videoUrl: "", mediaAssetId: undefined })
            }
            className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80"
            title="Remove video"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => setPickerOpen(true)}
      >
        <FilmIcon className="mr-1.5 size-3" />
        {hasVideo ? "Change Video" : "Choose Video"}
      </Button>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mediaType="video"
        onSelect={handleSelectAsset}
        onSelectFromDevice={handleSelectFromDevice}
      />

      {hasVideo && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-[0.6875rem] text-muted-foreground">
                Brightness
              </label>
              <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                {Math.round((bg.brightness ?? 1) * 100)}%
              </span>
            </div>
            <Slider
              value={[(bg.brightness ?? 1) * 100]}
              onValueChange={([v]) => onUpdate({ ...bg, brightness: v / 100 })}
              min={0}
              max={200}
              step={1}
            />
          </div>

          {/* Color Tint Overlay */}
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
              <input
                type="checkbox"
                checked={!!bg.tint}
                onChange={(e) =>
                  onUpdate({
                    ...bg,
                    tint: e.target.checked
                      ? buildTint("#000000", 50)
                      : undefined,
                  })
                }
                className="size-3.5 rounded border-border accent-primary"
              />
              Color Overlay
            </label>
            {bg.tint &&
              (() => {
                const { hex: tintHex, opacity: tintOpacity } = parseTintColor(
                  bg.tint
                )
                return (
                  <div className="flex flex-col gap-1.5 pl-5">
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={tintHex}
                        onChange={(e) =>
                          onUpdate({
                            ...bg,
                            tint: buildTint(e.target.value, tintOpacity),
                          })
                        }
                        className="size-7 cursor-pointer rounded border border-border"
                      />
                      <Input
                        value={tintHex}
                        onChange={(e) => {
                          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value))
                            onUpdate({
                              ...bg,
                              tint: buildTint(e.target.value, tintOpacity),
                            })
                        }}
                        className="h-7 flex-1 text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-[0.6875rem] text-muted-foreground">
                        Opacity
                      </label>
                      <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                        {tintOpacity}%
                      </span>
                    </div>
                    <Slider
                      value={[tintOpacity]}
                      onValueChange={([v]) =>
                        onUpdate({ ...bg, tint: buildTint(tintHex, v) })
                      }
                      min={0}
                      max={100}
                      step={1}
                    />
                  </div>
                )
              })()}
          </div>
        </>
      )}
    </div>
  )
}
