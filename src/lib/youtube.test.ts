// @vitest-environment jsdom
// buildEmbedUrl reads window.location.origin for the IFrame API origin param.
import { describe, it, expect } from "vitest"
import {
  isYouTubeUrl,
  extractVideoId,
  buildEmbedUrl,
  buildDisplayUrl,
} from "./youtube"

const VIDEO_ID = "dQw4w9WgXcQ"

function autoplayOf(url: string): string | null {
  return new URL(url).searchParams.get("autoplay")
}

describe("isYouTubeUrl / extractVideoId", () => {
  it("recognizes watch, short, embed and shorts URLs", () => {
    expect(isYouTubeUrl(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(
      true
    )
    expect(isYouTubeUrl(`https://youtu.be/${VIDEO_ID}`)).toBe(true)
    expect(isYouTubeUrl(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(true)
    expect(isYouTubeUrl(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(
      true
    )
    expect(isYouTubeUrl("https://example.com/video")).toBe(false)
  })

  it("extracts the 11-char video id", () => {
    expect(extractVideoId(`https://youtu.be/${VIDEO_ID}`)).toBe(VIDEO_ID)
    expect(extractVideoId("https://example.com")).toBeNull()
  })
})

describe("buildEmbedUrl autoplay", () => {
  it("cues paused by default (no autoplay opt-in)", () => {
    expect(autoplayOf(buildEmbedUrl(VIDEO_ID))).toBe("0")
    expect(autoplayOf(buildEmbedUrl(VIDEO_ID, {}))).toBe("0")
  })

  it("stays paused when autoplay is explicitly false", () => {
    expect(autoplayOf(buildEmbedUrl(VIDEO_ID, { autoplay: false }))).toBe("0")
  })

  it("plays only when autoplay is explicitly true", () => {
    expect(autoplayOf(buildEmbedUrl(VIDEO_ID, { autoplay: true }))).toBe("1")
  })
})

describe("buildDisplayUrl autoplay", () => {
  it("cues paused by default for a YouTube URL", () => {
    const url = buildDisplayUrl(`https://youtu.be/${VIDEO_ID}`)
    expect(autoplayOf(url)).toBe("0")
  })

  it("returns a non-YouTube URL unchanged", () => {
    expect(buildDisplayUrl("https://example.com/page")).toBe(
      "https://example.com/page"
    )
  })
})
