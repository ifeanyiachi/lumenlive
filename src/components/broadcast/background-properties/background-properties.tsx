import { useBroadcastStore } from "@/stores/broadcast-store"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DEFAULT_ANIMATED_BACKGROUND } from "./helpers"
import { SolidSection } from "./solid-section"
import { GradientSection } from "./gradient-section"
import { ImageSection } from "./image-section"
import { VideoSection } from "./video-section"
import { AnimatedSection } from "./animated-section"
import { TransparentSection } from "./transparent-section"
import { TextBoxSection } from "./text-box-section"

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
            if (v === "animated" && !draftTheme.background.animated) {
              update("background.animated", {
                ...DEFAULT_ANIMATED_BACKGROUND,
                palette: [...DEFAULT_ANIMATED_BACKGROUND.palette],
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
            <SelectItem value="animated">Animated</SelectItem>
            <SelectItem value="transparent">Transparent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional sections */}
      {bgType === "solid" && <SolidSection />}
      {bgType === "gradient" && <GradientSection />}
      {bgType === "image" && <ImageSection />}
      {bgType === "video" && <VideoSection />}
      {bgType === "animated" && <AnimatedSection />}
      {bgType === "transparent" && <TransparentSection />}

      {/* Text Box - always visible */}
      <TextBoxSection />
    </div>
  )
}
