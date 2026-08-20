import { describe, expect, it } from "vitest"
import type { Background } from "@/types/canvas"
import { backgroundToSlide } from "./background"

const base: Background = {
  type: "solid",
  color: "#123456",
  gradient: null,
  image: null,
  video: null,
}

describe("backgroundToSlide", () => {
  it("passes a solid colour through", () => {
    expect(backgroundToSlide(base)).toEqual({ type: "solid", color: "#123456" })
  })

  it("rescales gradient stops from 0–100 position to 0–1 offset", () => {
    const bg: Background = {
      ...base,
      type: "gradient",
      gradient: {
        type: "linear",
        angle: 135,
        stops: [
          { color: "#000", position: 0 },
          { color: "#fff", position: 100 },
        ],
      },
    }
    expect(backgroundToSlide(bg)).toEqual({
      type: "gradient",
      color: "#123456",
      gradient: {
        type: "linear",
        angle: 135,
        stops: [
          { offset: 0, color: "#000" },
          { offset: 1, color: "#fff" },
        ],
      },
    })
  })

  it("flattens an image background and drops a null tint", () => {
    const bg: Background = {
      ...base,
      type: "image",
      image: {
        url: "u",
        fit: "cover",
        blur: 4,
        brightness: 0.8,
        tint: null,
      },
    }
    expect(backgroundToSlide(bg)).toEqual({
      type: "image",
      color: "#123456",
      imageUrl: "u",
      blur: 4,
      brightness: 0.8,
      tint: undefined,
    })
  })

  it("flattens a video background", () => {
    const bg: Background = {
      ...base,
      type: "video",
      video: { url: "v", fit: "cover", brightness: 1 },
    }
    expect(backgroundToSlide(bg)).toEqual({
      type: "video",
      color: "#123456",
      videoUrl: "v",
      brightness: 1,
    })
  })

  it("carries an animated background spec through", () => {
    const animated = {
      preset: "aurora" as const,
      palette: ["#000", "#fff"],
      speed: 1,
      intensity: 0.5,
    }
    const bg: Background = { ...base, type: "animated", animated }
    expect(backgroundToSlide(bg)).toEqual({
      type: "animated",
      color: "#123456",
      animated,
    })
  })

  it("maps transparent through", () => {
    expect(backgroundToSlide({ ...base, type: "transparent" })).toEqual({
      type: "transparent",
    })
  })

  it("degrades a malformed gradient/image/video to the solid colour", () => {
    expect(backgroundToSlide({ ...base, type: "gradient" })).toEqual({
      type: "solid",
      color: "#123456",
    })
    expect(backgroundToSlide({ ...base, type: "image" })).toEqual({
      type: "solid",
      color: "#123456",
    })
    expect(backgroundToSlide({ ...base, type: "video" })).toEqual({
      type: "solid",
      color: "#123456",
    })
  })
})
