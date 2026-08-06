import { useBroadcastStore } from "@/stores/broadcast-store"
import {
  pickThemeBackgroundImage,
  pickVideoFile,
} from "@/lib/theme-designer-files"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  GradientControls as SharedGradientControls,
  SolidControls as SharedSolidControls,
} from "@/components/shared/gradient-controls"
import type { GradientValue } from "@/components/shared/gradient-controls"

function parseColorOpacity(color: string): { hex: string; opacity: number } {
  if (color.length === 9 && color.startsWith("#")) {
    const alphaHex = color.slice(7, 9)
    const alpha = parseInt(alphaHex, 16) / 255
    return { hex: color.slice(0, 7), opacity: Math.round(alpha * 100) }
  }
  if (color.length === 7 && color.startsWith("#")) {
    return { hex: color, opacity: 100 }
  }
  return { hex: color || "#000000", opacity: 100 }
}

function buildColorWithOpacity(hex: string, opacity: number): string {
  if (opacity >= 100) return hex
  const alphaHex = Math.round((opacity / 100) * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}

function SolidSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Background Color
      </label>
      <SharedSolidControls
        color={draftTheme.background.color}
        onChange={(color) => update("background.color", color)}
      />
    </div>
  )
}

function GradientSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !draftTheme.background.gradient) return null

  const gradient = draftTheme.background.gradient
  const sharedGradient: GradientValue = {
    type: gradient.type,
    angle: gradient.angle,
    stops: gradient.stops.map((s) => ({
      color: s.color,
      position: s.position,
    })),
  }

  return (
    <SharedGradientControls
      gradient={sharedGradient}
      onUpdate={(g) => {
        update("background.gradient", {
          type: g.type,
          angle: g.angle,
          stops: g.stops.map((s) => ({ color: s.color, position: s.position })),
        })
      }}
    />
  )
}

function ImageSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !draftTheme.background.image) return null

  const image = draftTheme.background.image
  const tint = image.tint
    ? parseColorOpacity(image.tint)
    : { hex: "#000000", opacity: 50 }

  return (
    <div className="flex flex-col gap-3">
      {/* Image Source */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Background Image
        </label>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            void (async () => {
              const dataUrl = await pickThemeBackgroundImage()
              if (dataUrl) update("background.image.url", dataUrl)
            })()
          }}
        >
          Change Image
        </Button>
      </div>

      {/* Fit Mode */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Fit Mode
        </label>
        <Select
          value={image.fit}
          onValueChange={(v) => update("background.image.fit", v)}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="stretch">Stretch</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Effects */}
      <div className="flex flex-col gap-3 border-t pt-3">
        <h4 className="text-xs font-semibold">Effects</h4>

        {/* Blur */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Blur
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {image.blur}px
            </span>
          </div>
          <Slider
            min={0}
            max={50}
            step={1}
            value={[image.blur]}
            onValueChange={([v]) => update("background.image.blur", v)}
          />
        </div>

        {/* Brightness */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Brightness
            </label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {image.brightness}%
            </span>
          </div>
          <Slider
            min={0}
            max={200}
            step={1}
            value={[image.brightness]}
            onValueChange={([v]) => update("background.image.brightness", v)}
          />
        </div>
      </div>

      {/* Color Overlay */}
      <div className="flex flex-col gap-3 border-t pt-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">Color Overlay</h4>
          <input
            type="checkbox"
            checked={image.tint !== null}
            onChange={(e) => {
              if (e.target.checked) {
                update(
                  "background.image.tint",
                  buildColorWithOpacity("#000000", 50)
                )
              } else {
                update("background.image.tint", null)
              }
            }}
            className="h-4 w-4 rounded border-input accent-primary"
          />
        </div>

        {image.tint !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={tint.hex}
                onChange={(e) =>
                  update(
                    "background.image.tint",
                    buildColorWithOpacity(e.target.value, tint.opacity)
                  )
                }
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={tint.hex}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    update(
                      "background.image.tint",
                      buildColorWithOpacity(v, tint.opacity)
                    )
                  }
                }}
                className="w-20 font-mono"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Opacity
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {tint.opacity}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[tint.opacity]}
              onValueChange={([v]) =>
                update(
                  "background.image.tint",
                  buildColorWithOpacity(tint.hex, v)
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

function VideoSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme || !draftTheme.background.video) return null

  const video = draftTheme.background.video
  const fileName = video.url
    ? (video.url.split(/[\\/]/).pop() ?? "No file")
    : "No file selected"

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Video File
        </label>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => {
              void (async () => {
                const path = await pickVideoFile()
                if (path) update("background.video.url", path)
              })()
            }}
          >
            {video.url ? "Change Video" : "Choose Video"}
          </Button>
        </div>
        {video.url && (
          <p
            className="truncate text-[11px] text-muted-foreground"
            title={video.url}
          >
            {fileName}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Fit Mode
        </label>
        <Select
          value={video.fit}
          onValueChange={(v) => update("background.video.fit", v)}
        >
          <SelectTrigger className="w-full">
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
            Brightness
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {video.brightness}%
          </span>
        </div>
        <Slider
          min={0}
          max={200}
          step={1}
          value={[video.brightness]}
          onValueChange={([v]) => update("background.video.brightness", v)}
        />
      </div>
    </div>
  )
}

function TransparentSection() {
  return (
    <div className="rounded-md border border-dashed p-3">
      <p className="text-xs text-muted-foreground">
        Background is transparent for NDI overlay mode
      </p>
    </div>
  )
}

function TextBoxSection() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const textBox = draftTheme.textBox
  const { hex: boxColorHex } = parseColorOpacity(textBox.color)

  return (
    <div className="flex flex-col gap-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Text Box</h4>
        <input
          type="checkbox"
          checked={textBox.enabled}
          onChange={(e) => {
            update("textBox.enabled", e.target.checked)
            if (e.target.checked && textBox.opacity === 0) {
              update("textBox.opacity", 0.5)
            }
          }}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      </div>

      {textBox.enabled && (
        <div className="flex flex-col gap-3">
          {/* Color */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={boxColorHex}
                onChange={(e) => update("textBox.color", e.target.value)}
                className="h-7 w-8 cursor-pointer rounded border border-input bg-transparent p-0.5"
              />
              <Input
                value={boxColorHex}
                onChange={(e) => {
                  const v = e.target.value
                  if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    update("textBox.color", v)
                  }
                }}
                className="w-20 font-mono"
              />
            </div>
          </div>

          {/* Opacity */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Opacity
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(textBox.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[Math.round(textBox.opacity * 100)]}
              onValueChange={([v]) => update("textBox.opacity", v / 100)}
            />
          </div>

          {/* Border Radius */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Border Radius
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {textBox.borderRadius}px
              </span>
            </div>
            <Slider
              min={0}
              max={50}
              step={1}
              value={[textBox.borderRadius]}
              onValueChange={([v]) => update("textBox.borderRadius", v)}
            />
          </div>

          {/* Padding */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">
                Padding
              </label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {textBox.padding}px
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[textBox.padding]}
              onValueChange={([v]) => update("textBox.padding", v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function BackgroundProperties() {
  const draftTheme = useBroadcastStore((s) => s.draftTheme)
  const update = useBroadcastStore((s) => s.updateDraftNested)

  if (!draftTheme) return null

  const bgType = draftTheme.background.type

  return (
    <div className="flex flex-col gap-3">
      {/* Background Type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Background Type
        </label>
        <Select
          value={bgType}
          onValueChange={(v) => {
            update("background.type", v)
            // Initialize gradient/image if switching to those types
            if (v === "gradient" && !draftTheme.background.gradient) {
              update("background.gradient", {
                type: "linear",
                angle: 180,
                stops: [
                  { color: "#000000", position: 0 },
                  { color: "#ffffff", position: 100 },
                ],
              })
            }
            if (v === "image" && !draftTheme.background.image) {
              update("background.image", {
                url: "",
                fit: "cover",
                blur: 0,
                brightness: 100,
                tint: null,
              })
            }
            if (v === "video" && !draftTheme.background.video) {
              update("background.video", {
                url: "",
                fit: "cover",
                brightness: 100,
              })
            }
          }}
        >
          <SelectTrigger className="w-full">
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

      {/* Conditional sections */}
      {bgType === "solid" && <SolidSection />}
      {bgType === "gradient" && <GradientSection />}
      {bgType === "image" && <ImageSection />}
      {bgType === "video" && <VideoSection />}
      {bgType === "transparent" && <TransparentSection />}

      {/* Text Box - always visible */}
      <TextBoxSection />
    </div>
  )
}
