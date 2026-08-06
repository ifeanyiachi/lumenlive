import { describe, expect, it } from "vitest"
import { ndiFrameRateToNumber, ndiResolutionToDimensions } from "./ndi"

describe("ndiFrameRateToNumber", () => {
  it("maps each frame-rate enum to its fps", () => {
    expect(ndiFrameRateToNumber("fps24")).toBe(24)
    expect(ndiFrameRateToNumber("fps30")).toBe(30)
    expect(ndiFrameRateToNumber("fps60")).toBe(60)
  })
})

describe("ndiResolutionToDimensions", () => {
  it("maps each resolution enum to pixel dimensions", () => {
    expect(ndiResolutionToDimensions("r720p")).toEqual({
      width: 1280,
      height: 720,
    })
    expect(ndiResolutionToDimensions("r1080p")).toEqual({
      width: 1920,
      height: 1080,
    })
    expect(ndiResolutionToDimensions("r4k")).toEqual({
      width: 3840,
      height: 2160,
    })
  })
})
