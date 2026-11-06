import { beforeEach, describe, expect, it, vi } from "vitest"

const v1 = vi.fn()

vi.mock("./lumenbo-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lumenbo-client")>()
  return {
    ...actual,
    v1: (...args: unknown[]) => v1(...args),
  }
})

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

  it("silently retries a rate-limited key pull with bounded backoff", async () => {
    vi.useFakeTimers()
    try {
      const { LicensingError } = await import("./lumenbo-client")
      v1
        .mockRejectedValueOnce(
          new LicensingError("TOO_MANY_REQUESTS", "Slow down", 429, {
            retryAfterMs: 10_000,
          }),
        )
        .mockResolvedValueOnce({ mode: "platform_trial", key: "key" })

      const pending = pullTranscriptionKey("session-token", "machine-1")
      await vi.advanceTimersByTimeAsync(2_000)

      await expect(pending).resolves.toEqual({
        mode: "platform_trial",
        key: "key",
      })
      expect(v1).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("stops after the bounded rate-limit retry budget", async () => {
    vi.useFakeTimers()
    try {
      const { LicensingError } = await import("./lumenbo-client")
      v1.mockRejectedValue(
        new LicensingError("TOO_MANY_REQUESTS", "Slow down", 429),
      )

      const pending = pullTranscriptionKey("session-token", "machine-1")
      const assertion = expect(pending).rejects.toMatchObject({ status: 429 })
      await vi.advanceTimersByTimeAsync(2_000)

      await assertion
      expect(v1).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
