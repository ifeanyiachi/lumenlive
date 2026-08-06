import type { NdiFrameRate, NdiResolution } from "@/types"

/**
 * Pure NDI configuration helpers.
 *
 * These translate the enum-style NDI settings into concrete numbers used in the
 * `broadcast:ndi-config` payload. No I/O — extracted out of the settings
 * component so the mapping is unit-testable and lives in one place.
 */

/** Frames-per-second for an {@link NdiFrameRate}. */
export function ndiFrameRateToNumber(frameRate: NdiFrameRate): number {
  switch (frameRate) {
    case "fps24":
      return 24
    case "fps30":
      return 30
    case "fps60":
      return 60
  }
}

/** Pixel dimensions for an {@link NdiResolution}. Defaults to 1080p. */
export function ndiResolutionToDimensions(resolution: NdiResolution): {
  width: number
  height: number
} {
  return resolution === "r720p"
    ? { width: 1280, height: 720 }
    : resolution === "r4k"
      ? { width: 3840, height: 2160 }
      : { width: 1920, height: 1080 }
}
