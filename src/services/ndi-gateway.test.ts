import { beforeEach, describe, expect, it, vi } from "vitest"

const { invokeMock, emitToMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  emitToMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/api/event", () => ({ emitTo: emitToMock }))

import { emitNdiConfig, startNdi, stopNdi } from "./ndi-gateway"
import type { NdiStartRequest } from "@/types"

describe("ndi-gateway", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(undefined)
    emitToMock.mockReset().mockResolvedValue(undefined)
  })

  it("startNdi invokes start_ndi with the request", () => {
    const request: NdiStartRequest = {
      sourceName: "LumenLive Output",
      resolution: "r1080p",
      frameRate: "fps30",
      alphaMode: "straightAlpha",
    }
    startNdi("main", request)
    expect(invokeMock).toHaveBeenCalledWith("start_ndi", {
      outputId: "main",
      request,
    })
  })

  it("stopNdi invokes stop_ndi", () => {
    stopNdi("alt")
    expect(invokeMock).toHaveBeenCalledWith("stop_ndi", { outputId: "alt" })
  })

  it("emitNdiConfig emits broadcast:ndi-config to the output window label", () => {
    const config = { active: true, fps: 30, width: 1920, height: 1080 }
    emitNdiConfig("main", config)
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:ndi-config",
      config
    )
    emitNdiConfig("alt", config)
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:ndi-config",
      config
    )
  })
})
