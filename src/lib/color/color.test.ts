import { describe, expect, it } from "vitest"
import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  isHex,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
} from "./color"

describe("normalizeHex", () => {
  it("accepts 6-digit hex with and without leading #", () => {
    expect(normalizeHex("#3A7BD5")).toBe("#3a7bd5")
    expect(normalizeHex("3a7bd5")).toBe("#3a7bd5")
  })

  it("expands 3-digit shorthand", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc")
    expect(normalizeHex("f00")).toBe("#ff0000")
  })

  it("trims surrounding whitespace", () => {
    expect(normalizeHex("  #ffffff  ")).toBe("#ffffff")
  })

  it("rejects non-hex input", () => {
    expect(normalizeHex("rgba(0,0,0,0.5)")).toBeNull()
    expect(normalizeHex("#12")).toBeNull()
    expect(normalizeHex("#1234")).toBeNull()
    expect(normalizeHex("nope")).toBeNull()
    expect(normalizeHex("")).toBeNull()
  })
})

describe("isHex", () => {
  it("mirrors normalizeHex", () => {
    expect(isHex("#fff")).toBe(true)
    expect(isHex("rgba(0,0,0,1)")).toBe(false)
  })
})

describe("hex <-> rgb", () => {
  it("round-trips", () => {
    expect(hexToRgb("#3a7bd5")).toEqual({ r: 58, g: 123, b: 213 })
    expect(rgbToHex({ r: 58, g: 123, b: 213 })).toBe("#3a7bd5")
  })

  it("falls back to black for bad hex", () => {
    expect(hexToRgb("not-a-color")).toEqual({ r: 0, g: 0, b: 0 })
  })

  it("clamps out-of-range channels when serializing", () => {
    expect(rgbToHex({ r: -10, g: 300, b: 128 })).toBe("#00ff80")
  })
})

describe("rgb <-> hsv round-trips", () => {
  const samples = [
    "#000000",
    "#ffffff",
    "#ff0000",
    "#00ff00",
    "#0000ff",
    "#3a7bd5",
    "#808080",
    "#123456",
    "#abcdef",
  ]

  it("hex -> hsv -> hex is stable", () => {
    for (const hex of samples) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex)
    }
  })

  it("rgb -> hsv -> rgb is stable", () => {
    for (const hex of samples) {
      const rgb = hexToRgb(hex)
      expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb)
    }
  })
})

describe("known hsv values", () => {
  it("pure red", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 })
  })

  it("black has zero saturation and value", () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 })
  })

  it("white has zero saturation, full value", () => {
    expect(rgbToHsv({ r: 255, g: 255, b: 255 })).toEqual({
      h: 0,
      s: 0,
      v: 100,
    })
  })

  it("hue wraps for negative/oversized input", () => {
    expect(hsvToRgb({ h: -300, s: 100, v: 100 })).toEqual(
      hsvToRgb({ h: 60, s: 100, v: 100 })
    )
    expect(hsvToRgb({ h: 420, s: 100, v: 100 })).toEqual(
      hsvToRgb({ h: 60, s: 100, v: 100 })
    )
  })
})
