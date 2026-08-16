import type { LiveWeb, WebContentPayload } from "@/types/broadcast"

/**
 * Build the `web-content` cue pushed to each output's embedded YouTube layer.
 * The caller guards `isYouTube`/`videoId` before presenting; `muted` rides the
 * live broadcast mute state. Extracted from `syncWebOutput`.
 */
export function toWebContentPayload(
  web: LiveWeb,
  muted: boolean
): WebContentPayload {
  return {
    videoId: web.videoId ?? "",
    start: web.startTime ?? 0,
    end: web.endTime ?? 0,
    isLive: web.isLive ?? false,
    muted,
    autoplay: web.autoplay ?? false,
    nonce: web.nonce ?? 0,
  }
}
