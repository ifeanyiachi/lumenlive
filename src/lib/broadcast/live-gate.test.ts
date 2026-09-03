import { describe, it, expect } from "vitest"
import { requiredLiveFeature, liveFeatureLabel } from "./live-gate"

const empty = { previewSlide: null, previewMedia: null, previewWeb: null }

describe("requiredLiveFeature", () => {
  it("returns null for scripture (a verse) — every tier may take it", () => {
    // Nothing staged in the non-verse fields ⇒ the take is a verse ⇒ free.
    expect(requiredLiveFeature(empty)).toBeNull()
  })

  it("requires full_slides for a staged slide", () => {
    expect(requiredLiveFeature({ ...empty, previewSlide: {} })).toBe(
      "full_slides"
    )
  })

  it("requires media_images for a staged image", () => {
    expect(
      requiredLiveFeature({ ...empty, previewMedia: { mediaType: "image" } })
    ).toBe("media_images")
  })

  it("requires media_video_audio for staged video or audio", () => {
    expect(
      requiredLiveFeature({ ...empty, previewMedia: { mediaType: "video" } })
    ).toBe("media_video_audio")
    expect(
      requiredLiveFeature({ ...empty, previewMedia: { mediaType: "audio" } })
    ).toBe("media_video_audio")
  })

  it("requires youtube_integration for staged web", () => {
    expect(requiredLiveFeature({ ...empty, previewWeb: {} })).toBe(
      "youtube_integration"
    )
  })

  it("follows takeToLive's precedence (web → media → slide)", () => {
    // A defensive belt-and-braces case: if more than one preview field is set,
    // the key returned matches which one takeToLive would actually commit.
    expect(
      requiredLiveFeature({
        previewSlide: {},
        previewMedia: { mediaType: "video" },
        previewWeb: {},
      })
    ).toBe("youtube_integration")
    expect(
      requiredLiveFeature({
        previewSlide: {},
        previewMedia: { mediaType: "image" },
        previewWeb: null,
      })
    ).toBe("media_images")
  })
})

describe("liveFeatureLabel", () => {
  it("maps each gated feature to operator-facing copy", () => {
    expect(liveFeatureLabel("full_slides")).toBe("Slide output")
    expect(liveFeatureLabel("media_images")).toBe("Image output")
    expect(liveFeatureLabel("media_video_audio")).toBe("Video & audio output")
    expect(liveFeatureLabel("youtube_integration")).toBe("Web / YouTube output")
  })

  it("falls back to a generic label for an unknown key", () => {
    expect(liveFeatureLabel("something_else")).toBe("Live output")
  })
})
