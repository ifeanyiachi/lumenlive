import { invoke } from "@tauri-apps/api/core"

/**
 * Gateway for the audience-facing *web overlay* windows (YouTube / arbitrary
 * URLs layered over an output). It owns the three backend command names so the
 * broadcast store expresses intent ("open this overlay", "mute it") without
 * hardcoding Tauri command strings.
 *
 * All three paths are fire-and-forget at the call sites, so these return the
 * underlying promise and leave rejection handling (`.catch`) to the caller.
 */

/** Player config for a controllable (YouTube IFrame API) overlay. */
export interface WebOverlayConfig {
  videoId: string
  start?: number
  end?: number
  isLive?: boolean
  muted: boolean
  autoplay: boolean
}

/** Open (or navigate) a web overlay window for the given output. */
export function openWebOverlay(
  outputId: string,
  url: string,
  config?: WebOverlayConfig
): Promise<unknown> {
  return invoke("open_web_overlay", { outputId, url, config })
}

/** Close the web overlay window for the given output. */
export function closeWebOverlay(outputId: string): Promise<unknown> {
  return invoke("close_web_overlay", { outputId })
}

/** Mute/unmute a plain (non-IFrame-API) navigated overlay via backend eval. */
export function muteWebOverlay(
  outputId: string,
  muted: boolean
): Promise<unknown> {
  return invoke("mute_web_overlay", { outputId, muted })
}
