import { describe, it, expect } from "vitest"
import { toWebContentPayload } from "./web-payload"
import type { LiveWeb } from "@/types/broadcast"

describe("toWebContentPayload", () => {
  it("maps a LiveWeb + mute state into the output cue, defaulting optionals", () => {
    const web: LiveWeb = { url: "u", isYouTube: true, videoId: "abc123" }
    expect(toWebContentPayload(web, false)).toEqual({
      videoId: "abc123",
      start: 0,
      end: 0,
      isLive: false,
      muted: false,
      autoplay: false,
      nonce: 0,
    })
  })

  it("carries through explicit fields and the muted flag", () => {
    const web: LiveWeb = {
      url: "u",
      isYouTube: true,
      videoId: "vid",
      startTime: 12,
      endTime: 300,
      isLive: true,
      autoplay: true,
      nonce: 7,
    }
    expect(toWebContentPayload(web, true)).toEqual({
      videoId: "vid",
      start: 12,
      end: 300,
      isLive: true,
      muted: true,
      autoplay: true,
      nonce: 7,
    })
  })
})
