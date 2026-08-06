import { describe, expect, it, beforeEach, vi } from "vitest"

// Static gateway imports trip vitest's vi.mock hoisting unless the mock fns are
// created via vi.hoisted (see Phase 2 note in decouple.md).
const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))

import { listAudioDevices } from "./audio-devices-gateway"
import {
  listTranslations,
  getActiveTranslation,
  setActiveTranslation,
} from "./translation-gateway"
import {
  getOscStatus,
  getHttpStatus,
  startOsc,
  stopOsc,
  startHttp,
  stopHttp,
} from "./remote-control-gateway"

beforeEach(() => {
  invokeMock.mockReset()
  invokeMock.mockResolvedValue(undefined)
})

describe("audio-devices-gateway", () => {
  it("listAudioDevices invokes get_audio_devices", async () => {
    invokeMock.mockResolvedValue([{ id: "a", name: "Mic", is_default: true }])
    const devices = await listAudioDevices()
    expect(invokeMock).toHaveBeenCalledWith("get_audio_devices")
    expect(devices).toHaveLength(1)
  })
})

describe("translation-gateway", () => {
  it("listTranslations invokes list_translations", async () => {
    await listTranslations()
    expect(invokeMock).toHaveBeenCalledWith("list_translations")
  })

  it("getActiveTranslation invokes get_active_translation", async () => {
    await getActiveTranslation()
    expect(invokeMock).toHaveBeenCalledWith("get_active_translation")
  })

  it("setActiveTranslation passes translationId", async () => {
    await setActiveTranslation(4)
    expect(invokeMock).toHaveBeenCalledWith("set_active_translation", {
      translationId: 4,
    })
  })
})

describe("remote-control-gateway", () => {
  it("status getters invoke the matching commands", async () => {
    await getOscStatus()
    await getHttpStatus()
    expect(invokeMock).toHaveBeenCalledWith("get_osc_status")
    expect(invokeMock).toHaveBeenCalledWith("get_http_status")
  })

  it("start/stop invoke the matching commands with ports", async () => {
    await startOsc(8000)
    await stopOsc()
    await startHttp(8080)
    await stopHttp()
    expect(invokeMock).toHaveBeenCalledWith("start_osc", { port: 8000 })
    expect(invokeMock).toHaveBeenCalledWith("stop_osc")
    expect(invokeMock).toHaveBeenCalledWith("start_http", { port: 8080 })
    expect(invokeMock).toHaveBeenCalledWith("stop_http")
  })
})
