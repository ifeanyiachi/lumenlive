import type { Background } from "@/types/canvas"
import type { SlideBackground } from "@/types/slide"

/**
 * Convert a broadcast/canvas {@link Background} to a {@link SlideBackground}
 * (themeredo.md, Phase 5 migration).
 *
 * The two share one animated-background spec but differ elsewhere: canvas
 * gradients place stops on a 0–100 `position` scale, slide gradients on a 0–1
 * `offset`; canvas image/video brightness is a 0–100 percentage (100 = normal)
 * while slide brightness is a 0–1 multiplier (1 = normal) — both are rescaled
 * here. Canvas image/video are nested objects, slide backgrounds flatten them to
 * `imageUrl`/`videoUrl` + `blur`/`brightness`/`tint`. A malformed source (e.g.
 * `type: "gradient"` with a null `gradient`) degrades to the solid colour so a
 * migrated theme never renders blank.
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
        // Canvas 0–100 percentage → slide 0–1 multiplier (100 → 1 = no-op).
        // Without this, a default brightness of 100 paints an opaque white wash
        // over the image (drawBrightnessAndTint), rendering it solid white.
        brightness:
          bg.image.brightness != null ? bg.image.brightness / 100 : undefined,
        tint: bg.image.tint ?? undefined,
      }
    case "video":
      if (!bg.video) return { type: "solid", color: bg.color }
      return {
        type: "video",
        color: bg.color,
        videoUrl: bg.video.url,
        // Canvas 0–100 percentage → slide 0–1 multiplier (see image case).
        brightness:
          bg.video.brightness != null ? bg.video.brightness / 100 : undefined,
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
