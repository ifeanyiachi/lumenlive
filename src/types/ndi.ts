export type NdiResolution = "r720p" | "r1080p" | "r4k"
export type NdiFrameRate = "fps24" | "fps30" | "fps60"
export type NdiAlphaMode = "noneOpaque" | "straightAlpha"

export interface NdiStartRequest {
  sourceName: string
  resolution: NdiResolution
  frameRate: NdiFrameRate
  alphaMode: NdiAlphaMode
}

export interface NdiSessionInfo {
  sourceName: string
  resolution: NdiResolution
  frameRate: NdiFrameRate
  alphaMode: NdiAlphaMode
  width: number
  height: number
  fps: number
}

export interface NdiConfigEventPayload {
  active: boolean
  fps: number
  width: number
  height: number
  /**
   * Alpha handling for the feed. `straightAlpha` lets the output send a
   * see-through (keyable) frame when the live content has a transparent
   * background; `noneOpaque` always sends the opaque program mirror. Optional so
   * older payloads default to opaque.
   */
  alphaMode?: NdiAlphaMode
}
