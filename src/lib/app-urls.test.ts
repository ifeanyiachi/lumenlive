import { describe, it, expect } from "vitest"

import { appUrl } from "./app-urls"

describe("appUrl", () => {
  it("builds an absolute URL on the default app host", () => {
    // No VITE_LUMENLIVE_APP_URL set in the test env → falls back to the default.
    expect(appUrl("/signup")).toBe("https://app.lumenlive.xyz/signup")
    expect(appUrl("/account/transcription")).toBe(
      "https://app.lumenlive.xyz/account/transcription"
    )
  })

  it("tolerates a path with no leading slash", () => {
    expect(appUrl("login")).toBe("https://app.lumenlive.xyz/login")
  })
})
