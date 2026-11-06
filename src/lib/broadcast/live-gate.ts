/**
 * Which entitlement a staged item needs before it may be pushed to the audience.
 *
 * Free is a scripture-first tier: it may stage and preview anything, but only
 * *scripture* (a verse) may be taken to live output. Every richer content kind
 * maps to the Starter feature that unlocks sending it live — so the single
 * `takeToLive` choke point can refuse it, regardless of how the item was staged
 * (operator Take button, Enter, schedule auto-advance, remote control).
 *
 * Pure over plain data — no React/Zustand/Tauri. The store reads the current
 * entitlement and consults `can(key)`; this only decides *which* key matters.
 */

/** The staged preview, narrowed to the fields that decide the gate. */
export interface StagedContent {
  previewSlide: unknown | null
  previewMedia: { mediaType: "image" | "video" | "audio" } | null
  previewWeb: unknown | null
}

/**
 * The feature key required to take the staged content live, or `null` when it is
 * scripture (a verse) — which every tier may take. Precedence mirrors
 * `takeToLive`'s own commit order: web → media → slide → verse.
 */
export function requiredLiveFeature(staged: StagedContent): string | null {
  if (staged.previewWeb) return "youtube_integration"
  if (staged.previewMedia) {
    return staged.previewMedia.mediaType === "image"
      ? "media_images"
      : "media_video_audio"
  }
  if (staged.previewSlide) return "full_slides"
  return null
}

/** Operator-facing label for the upgrade prompt when a take is blocked. */
export function liveFeatureLabel(key: string): string {
  switch (key) {
    case "youtube_integration":
      return "Web / YouTube output"
    case "media_images":
      return "Image output"
    case "media_video_audio":
      return "Video & audio output"
    case "full_slides":
      return "Slide output"
    default:
      return "Live output"
  }
}
