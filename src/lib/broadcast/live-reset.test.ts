import { describe, it, expect } from "vitest"
import { clearedLiveFields } from "./live-reset"

describe("clearedLiveFields", () => {
  it("clears every mutually-exclusive live-content field", () => {
    expect(clearedLiveFields()).toEqual({
      liveVerse: null,
      liveVersePages: null,
      liveVersePageIndex: 0,
      liveSlide: null,
      liveMedia: null,
      liveWeb: null,
      mediaTransport: null,
      webTransport: null,
    })
  })

  it("returns a fresh object each call (safe to spread + override)", () => {
    expect(clearedLiveFields()).not.toBe(clearedLiveFields())
  })
})
