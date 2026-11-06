import { describe, expect, it, beforeEach, vi } from "vitest"

// vi.hoisted so the mock fn exists before the gateway's static import runs.
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import { sendNdiFrame, getNdiStatus } from "./ndi-output-gateway"

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockResolvedValue(null)
})

describe("ndi-output-gateway", () => {
  it("sendNdiFrame ships the buffer with dimension + output-id headers", async () => {
    const buffer = new ArrayBuffer(8)
    await sendNdiFrame("main", buffer, 1920, 1080)
    expect(invokeMock).toHaveBeenCalledWith("push_ndi_frame", buffer, {
      headers: {
        "x-output-id": "main",
        "x-width": "1920",
        "x-height": "1080",
      },
    })
  })

  it("getNdiStatus invokes get_ndi_status with the output id", async () => {
    await getNdiStatus("stage-2")
    expect(invokeMock).toHaveBeenCalledWith("get_ndi_status", {
      outputId: "stage-2",
    })
  })
})
