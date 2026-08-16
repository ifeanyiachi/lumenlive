import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  invokeMock,
  emitToMock,
  listenMock,
  getAllWindowsMock,
  availableMonitorsMock,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  emitToMock: vi.fn(),
  listenMock: vi.fn(),
  getAllWindowsMock: vi.fn(),
  availableMonitorsMock: vi.fn(),
}))

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }))
vi.mock("@tauri-apps/api/event", () => ({
  emitTo: emitToMock,
  listen: listenMock,
}))
vi.mock("@tauri-apps/api/window", () => ({
  getAllWindows: getAllWindowsMock,
  availableMonitors: availableMonitorsMock,
}))

import {
  closeBroadcastWindow,
  focusBroadcastWindow,
  ensureBroadcastWindow,
  isBroadcastWindowOpen,
  listMonitors,
  onOutputReady,
  openBroadcastWindow,
  requestOutputResync,
} from "./broadcast-window-gateway"

describe("broadcast-window-gateway", () => {
  beforeEach(() => {
    invokeMock.mockReset().mockResolvedValue(undefined)
    emitToMock.mockReset().mockResolvedValue(undefined)
    listenMock.mockReset().mockResolvedValue(() => {})
    getAllWindowsMock.mockReset()
    availableMonitorsMock.mockReset().mockResolvedValue([])
  })

  it("openBroadcastWindow invokes open_broadcast_window with monitor + mode", () => {
    openBroadcastWindow("main", 2)
    expect(invokeMock).toHaveBeenCalledWith("open_broadcast_window", {
      outputId: "main",
      monitorIndex: 2,
      mode: undefined,
    })
    openBroadcastWindow("alt", 0, "stage")
    expect(invokeMock).toHaveBeenCalledWith("open_broadcast_window", {
      outputId: "alt",
      monitorIndex: 0,
      mode: "stage",
    })
  })

  it("ensureBroadcastWindow invokes ensure_broadcast_window", () => {
    ensureBroadcastWindow("alt", "stage")
    expect(invokeMock).toHaveBeenCalledWith("ensure_broadcast_window", {
      outputId: "alt",
      mode: "stage",
    })
  })

  it("closeBroadcastWindow invokes close_broadcast_window", () => {
    closeBroadcastWindow("main")
    expect(invokeMock).toHaveBeenCalledWith("close_broadcast_window", {
      outputId: "main",
    })
  })

  it("focusBroadcastWindow invokes focus_broadcast_window", () => {
    focusBroadcastWindow("main")
    expect(invokeMock).toHaveBeenCalledWith("focus_broadcast_window", {
      outputId: "main",
    })
  })

  it("requestOutputResync emits broadcast:request-resync to the output window label", () => {
    requestOutputResync("main")
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast",
      "broadcast:request-resync"
    )
    requestOutputResync("alt")
    expect(emitToMock).toHaveBeenCalledWith(
      "broadcast-alt",
      "broadcast:request-resync"
    )
  })

  it("onOutputReady listens for broadcast:output-ready", () => {
    const handler = () => {}
    onOutputReady(handler)
    expect(listenMock).toHaveBeenCalledWith("broadcast:output-ready", handler)
  })

  it("isBroadcastWindowOpen checks the window list by label", async () => {
    getAllWindowsMock.mockResolvedValue([
      { label: "broadcast-alt" },
      { label: "control" },
    ])
    expect(await isBroadcastWindowOpen("alt")).toBe(true)
    expect(await isBroadcastWindowOpen("main")).toBe(false)
  })

  it("listMonitors delegates to availableMonitors", async () => {
    availableMonitorsMock.mockResolvedValue([{ name: "A" }])
    expect(await listMonitors()).toEqual([{ name: "A" }])
  })
})
