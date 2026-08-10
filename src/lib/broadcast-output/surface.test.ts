import { describe, it, expect } from "vitest"
import { resolveSurface, resolvePreviewObjectFit } from "./surface"

const MON = { width: 2560, height: 1080 } // 21:9 ultrawide
const NDI = { width: 1920, height: 1080 }
const CUSTOM = { width: 1280, height: 720 }

describe("resolveSurface precedence", () => {
  it("NDI wins over everything when active (feed must not distort)", () => {
    expect(
      resolveSurface({
        displayMode: "custom",
        window: MON,
        custom: CUSTOM,
        ndi: NDI,
      })
    ).toEqual({ width: 1920, height: 1080, source: "ndi" })
  })

  it("custom is used when displayMode=custom and no NDI", () => {
    expect(
      resolveSurface({ displayMode: "custom", window: MON, custom: CUSTOM })
    ).toEqual({ width: 1280, height: 720, source: "custom" })
  })

  it("custom falls through to native when custom size is missing/invalid", () => {
    expect(
      resolveSurface({ displayMode: "custom", window: MON, custom: null })
    ).toEqual({ width: 2560, height: 1080, source: "native" })
  })

  it("native uses the real window size when no NDI and mode is native", () => {
    expect(resolveSurface({ displayMode: "native", window: MON })).toEqual({
      width: 2560,
      height: 1080,
      source: "native",
    })
  })

  it("defaults to native when displayMode is undefined", () => {
    expect(resolveSurface({ window: MON })).toEqual({
      width: 2560,
      height: 1080,
      source: "native",
    })
  })

  it("falls back to 1920x1080 when nothing is known (hidden window)", () => {
    expect(resolveSurface({})).toEqual({
      width: 1920,
      height: 1080,
      source: "fallback",
    })
  })

  it("ignores zero/negative dimensions", () => {
    expect(
      resolveSurface({ window: { width: 0, height: 0 }, ndi: null })
    ).toEqual({ width: 1920, height: 1080, source: "fallback" })
  })
})

describe("resolvePreviewObjectFit", () => {
  it("native is a 1:1 fill (backing store == window)", () => {
    expect(resolvePreviewObjectFit("native", undefined)).toBe("fill")
  })

  it("custom honors customFit, defaulting to contain", () => {
    expect(resolvePreviewObjectFit("custom", undefined)).toBe("contain")
    expect(resolvePreviewObjectFit("custom", "cover")).toBe("cover")
    expect(resolvePreviewObjectFit("custom", "contain")).toBe("contain")
  })

  it("ndi and fallback letterbox (WYSIWYG with the feed / safe)", () => {
    expect(resolvePreviewObjectFit("ndi", undefined)).toBe("contain")
    expect(resolvePreviewObjectFit("fallback", "cover")).toBe("contain")
  })
})
