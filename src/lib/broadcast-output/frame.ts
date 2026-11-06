import {
  DEFAULT_MEDIA_FIT,
  type MediaFitConfig,
  type ContainBackground,
} from "@/lib/media-fit"

/** Fit-only wire payload — how the live media frame is drawn without reloading. */
export interface MediaFitPayload {
  fit?: MediaFitConfig["fit"]
  zoom?: number
  focalX?: number
  focalY?: number
  containBackground?: ContainBackground
  containBackgroundColor?: string
}

/** Map a wire payload's fit fields onto a resolved MediaFitConfig (with defaults). */
export function toFitConfig(p: MediaFitPayload): MediaFitConfig {
  return {
    fit: p.fit ?? DEFAULT_MEDIA_FIT.fit,
    zoom: p.zoom ?? DEFAULT_MEDIA_FIT.zoom,
    focalX: p.focalX ?? DEFAULT_MEDIA_FIT.focalX,
    focalY: p.focalY ?? DEFAULT_MEDIA_FIT.focalY,
    background: p.containBackground ?? DEFAULT_MEDIA_FIT.background,
    backgroundColor:
      p.containBackgroundColor ?? DEFAULT_MEDIA_FIT.backgroundColor,
  }
}

/**
 * NDI push rate gate. RAF fires up to ~60Hz; without this a 24fps NDI output
 * would encode ~2.5× the needed frames. `force` bypasses the gate for
 * content-change bursts and keepalives. The 2ms slack keeps a ~16.6ms RAF tick
 * from being dropped when targeting 60fps.
 */
export function shouldPushNdiFrame(
  now: number,
  lastPush: number,
  fps: number,
  force: boolean
): boolean {
  if (force) return true
  const minInterval = 1000 / (fps || 24)
  return now - lastPush >= minInterval - 2
}
