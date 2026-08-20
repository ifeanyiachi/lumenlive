import type { Background } from "@/types/canvas"
import type { SlideBackground } from "@/types/slide"

/**
 * Convert a broadcast/canvas {@link Background} to a {@link SlideBackground}
 * (themeredo.md, Phase 5 migration).
 *
 * The two share one animated-background spec but differ elsewhere: canvas
 * gradients place stops on a 0–100 `position` scale, slide gradients on a 0–1
 * `offset`; canvas image/video are nested objects, slide backgrounds flatten
 * them to `imageUrl`/`videoUrl` + `blur`/`brightness`/`tint`. A malformed source
 * (e.g. `type: "gradient"` with a null `gradient`) degrades to the solid colour
 * so a migrated theme never renders blank.
 *
 * PURE: no I/O, no shared mutable structure with the input.
 */
export function backgroundToSlide(bg: Background): SlideBackground {
  switch (bg.type) {
    case "solid":
      return { type: "solid", color: bg.color }
    case "gradient":
      if (!bg.gradient) return { type: "solid", color: bg.color }
      return {
        type: "gradient",
        color: bg.color,
        gradient: {
          type: bg.gradient.type,
          angle: bg.gradient.angle,
          stops: bg.gradient.stops.map((s) => ({
            offset: s.position / 100,
            color: s.color,
          })),
        },
      }
    case "image":
      if (!bg.image) return { type: "solid", color: bg.color }
      return {
        type: "image",
        color: bg.color,
        imageUrl: bg.image.url,
        blur: bg.image.blur,
        brightness: bg.image.brightness,
        tint: bg.image.tint ?? undefined,
      }
    case "video":
      if (!bg.video) return { type: "solid", color: bg.color }
      return {
        type: "video",
        color: bg.color,
        videoUrl: bg.video.url,
        brightness: bg.video.brightness,
      }
    case "animated":
      return {
        type: "animated",
        color: bg.color,
        animated: bg.animated ?? undefined,
      }
    case "transparent":
      return { type: "transparent" }
    default:
      return { type: "solid", color: bg.color }
  }
}
