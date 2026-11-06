import { describe, it, expect } from "vitest"
import type { Background, BaseBackground } from "@/types/broadcast"
import { baseSourceOf, makeBaseBackground } from "./base-background"

describe("baseSourceOf", () => {
  it("returns 'output' for no base background", () => {
    expect(baseSourceOf(null)).toBe("output")
  })

  it("returns 'theme' for a theme base", () => {
    expect(baseSourceOf({ kind: "theme", themeId: "t1" })).toBe("theme")
  })

  it("returns the background's own type for a bare background", () => {
    const bb: BaseBackground = {
      kind: "background",
      background: { type: "gradient" } as Background,
    }
    expect(baseSourceOf(bb)).toBe("gradient")
  })
})

describe("makeBaseBackground", () => {
  it("seeds a default gradient when switching to gradient with none prior", () => {
    const bg = makeBaseBackground("gradient", null)
    expect(bg.type).toBe("gradient")
    expect(bg.gradient).toEqual({
      type: "linear",
      angle: 180,
      stops: [
        { color: "#1e3a8a", position: 0 },
        { color: "#000000", position: 100 },
      ],
    })
  })

  it("seeds a default image field when switching to image", () => {
    const bg = makeBaseBackground("image", null)
    expect(bg.image).toEqual({
      url: "",
      fit: "cover",
      blur: 0,
      brightness: 100,
      tint: null,
    })
  })

  it("seeds a default video field when switching to video", () => {
    const bg = makeBaseBackground("video", null)
    expect(bg.video).toEqual({ url: "", fit: "cover", brightness: 100 })
  })

  it("preserves prior fields across a type switch", () => {
    const prev: Background = {
      type: "image",
      color: "#abcdef",
      gradient: null,
      image: {
        url: "x.png",
        fit: "cover",
        blur: 2,
        brightness: 90,
        tint: null,
      },
      video: null,
    }
    const bg = makeBaseBackground("solid", prev)
    expect(bg.type).toBe("solid")
    // Prior colour + image kept, so switching back doesn't lose them.
    expect(bg.color).toBe("#abcdef")
    expect(bg.image).toEqual(prev.image)
  })

  it("defaults colour to #000000 when there is no prior background", () => {
    expect(makeBaseBackground("solid", null).color).toBe("#000000")
  })

  it("keeps an existing gradient instead of overwriting it", () => {
    const prev: Background = {
      type: "gradient",
      color: "#000000",
      gradient: {
        type: "linear",
        angle: 90,
        stops: [
          { color: "#fff", position: 0 },
          { color: "#000", position: 100 },
        ],
      },
      image: null,
      video: null,
    }
    expect(makeBaseBackground("gradient", prev).gradient).toBe(prev.gradient)
  })
})
