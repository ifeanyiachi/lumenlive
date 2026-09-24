import { beforeEach, describe, expect, it, vi } from "vitest"

const v1 = vi.fn()

vi.mock("./lumenbo-client", () => ({
  v1: (...args: unknown[]) => v1(...args),
}))

import {
  pullTranscriptionKey,
  reportTranscriptionUsage,
} from "./transcription-key-gateway"

describe("transcription key gateway", () => {
  beforeEach(() => {
    v1.mockReset()
    v1.mockResolvedValue({})
  })

  it("binds key retrieval to the authenticated session and machine", async () => {
    await pullTranscriptionKey("session-token", "machine-1")

    expect(v1).toHaveBeenCalledWith("/v1/transcription/key", {
      method: "POST",
      token: "session-token",
      body: { machineId: "machine-1" },
    })
  })

  it("reports usage as a server-accepted delta with the same machine binding", async () => {
    await reportTranscriptionUsage("session-token", "machine-1", 12.5)

    expect(v1).toHaveBeenCalledWith("/v1/transcription/usage", {
      method: "POST",
      token: "session-token",
      body: { machineId: "machine-1", seconds: 12.5 },
    })
  })
})
