import { describe, expect, it } from "vitest"
import { LicensingError } from "@/services/lumenbo-client"
import { describeTranscriptionStartError } from "./start-error"

describe("describeTranscriptionStartError", () => {
  it("tells the operator when their session is invalid", () => {
    expect(
      describeTranscriptionStartError(
        new LicensingError("UNAUTHORIZED", "Authentication required", 401)
      )
    ).toContain("sign-in session is no longer valid")
  })

  it("keeps a real transport failure distinct from an account failure", () => {
    expect(
      describeTranscriptionStartError(
        new LicensingError("NETWORK", "connection refused", 0)
      )
    ).toContain("internet connection")
  })

  it("includes an unknown backend error code for support", () => {
    expect(
      describeTranscriptionStartError(
        new LicensingError("RATE_LIMITED", "Too many requests", 429)
      )
    ).toBe(
      "LumenLive could not prepare transcription. Too many requests (Error: RATE_LIMITED)"
    )
  })

  it("passes through the backend message for a service-unavailable failure", () => {
    expect(
      describeTranscriptionStartError(
        new LicensingError(
          "SERVICE_UNAVAILABLE",
          "Transcription is temporarily unavailable. Please try again shortly.",
          503
        )
      )
    ).toBe(
      "Transcription is temporarily unavailable. Please try again shortly. (Error: SERVICE_UNAVAILABLE)"
    )
  })

  it("includes the safe backend detail for a transcription service failure", () => {
    expect(
      describeTranscriptionStartError(
        new LicensingError("INTERNAL", "Soniox key creation failed (401)", 502)
      )
    ).toBe(
      "LumenLive could not prepare a transcription key: Soniox key creation failed (401). Try again shortly. (Error: INTERNAL)"
    )
  })
})
