import { describe, expect, it } from "vitest"
import { idleBlankSlide } from "./idle-slide"

describe("idleBlankSlide", () => {
  it("is an opaque-black frame with no elements", () => {
    const slide = idleBlankSlide(() => "idle-blank")
    expect(slide.background).toEqual({ type: "solid", color: "#000000" })
    expect(slide.elements).toEqual([])
    // No transition so stepping into/out of idle cuts instantly.
    expect(slide.transition).toBeUndefined()
  })

  it("injects id and timestamps deterministically", () => {
    const slide = idleBlankSlide(() => "idle-blank", 42)
    expect(slide.id).toBe("idle-blank")
    expect(slide.createdAt).toBe(42)
    expect(slide.updatedAt).toBe(42)
  })

  it("is opaque (never transparent) so it hides the base theme rather than compositing over it", () => {
    // The whole point: a transparent idle slide would re-reveal the base theme via
    // the renderer's transparent path. Guard against a regression to transparent.
    expect(idleBlankSlide(() => "x").background.type).toBe("solid")
  })
})
