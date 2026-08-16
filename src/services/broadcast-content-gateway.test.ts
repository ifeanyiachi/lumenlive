import { describe, it, expect, vi, beforeEach } from "vitest"

const emitToOutputMock = vi.fn()
const emitToAllOutputsMock = vi.fn()
const listenMock = vi.fn()
const emitToMock = vi.fn()

vi.mock("@/lib/broadcast-routing", () => ({
  emitToOutput: (...args: unknown[]) => emitToOutputMock(...args),
  emitToAllOutputs: (...args: unknown[]) => emitToAllOutputsMock(...args),
}))

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: listenMock,
    emitTo: emitToMock,
  }),
}))

import {
  BROADCAST_EVENTS,
  emitOutputEvent,
  broadcastOutputEvent,
  subscribeOutputEvents,
  emitToMain,
  emitMediaProgress,
  emitMediaEnded,
  emitOutputReady,
  type MediaUpdatePayload,
} from "./broadcast-content-gateway"
import type { BroadcastOutput } from "@/types/broadcast"

const flush = () => Promise.resolve().then(() => Promise.resolve())

describe("broadcast-content-gateway", () => {
  beforeEach(() => {
    emitToOutputMock.mockReset()
    emitToAllOutputsMock.mockReset()
    listenMock.mockReset()
    emitToMock.mockReset()
    emitToMock.mockResolvedValue(undefined)
  })

  describe("BROADCAST_EVENTS registry", () => {
    it("maps identifiers to the exact legacy wire strings", () => {
      // Guards the cross-window contract: a rename must be intentional.
      expect(BROADCAST_EVENTS.verseUpdate).toBe("broadcast:verse-update")
      expect(BROADCAST_EVENTS.slideUpdate).toBe("broadcast:slide-update")
      expect(BROADCAST_EVENTS.mediaUpdate).toBe("broadcast:media-update")
      expect(BROADCAST_EVENTS.outputVisibility).toBe(
        "broadcast:output-visibility"
      )
      expect(BROADCAST_EVENTS.mediaProgress).toBe("broadcast:media-progress")
      expect(BROADCAST_EVENTS.outputReady).toBe("broadcast:output-ready")
    })

    it("has no duplicate wire strings", () => {
      const values = Object.values(BROADCAST_EVENTS)
      expect(new Set(values).size).toBe(values.length)
    })
  })

  describe("forward emit", () => {
    it("emitOutputEvent forwards (outputId, event, payload) to the transport", () => {
      const payload: MediaUpdatePayload = {
        filePath: "C:/x.mp4",
        mediaType: "video",
        name: "x",
      }
      emitOutputEvent("main", BROADCAST_EVENTS.mediaUpdate, payload)
      expect(emitToOutputMock).toHaveBeenCalledWith(
        "main",
        "broadcast:media-update",
        payload
      )
    })

    it("broadcastOutputEvent fans out to all outputs", () => {
      const outputs = [{ id: "main" }] as BroadcastOutput[]
      broadcastOutputEvent(outputs, BROADCAST_EVENTS.mute, { muted: true })
      expect(emitToAllOutputsMock).toHaveBeenCalledWith(
        outputs,
        "broadcast:mute",
        { muted: true }
      )
    })

    it("emits a void event with an undefined payload", () => {
      emitOutputEvent("stage-2", BROADCAST_EVENTS.requestResync)
      expect(emitToOutputMock).toHaveBeenCalledWith(
        "stage-2",
        "broadcast:request-resync",
        undefined
      )
    })
  })

  describe("subscribeOutputEvents", () => {
    it("registers a listener per handler and routes the payload", async () => {
      listenMock.mockResolvedValue(vi.fn())
      const handler = vi.fn()
      subscribeOutputEvents({ "broadcast:verse-update": handler })

      expect(listenMock).toHaveBeenCalledWith(
        "broadcast:verse-update",
        expect.any(Function)
      )
      // Simulate an inbound event → handler receives the unwrapped payload.
      const cb = listenMock.mock.calls[0][1] as (e: {
        payload: unknown
      }) => void
      cb({ payload: { verse: null } })
      expect(handler).toHaveBeenCalledWith({ verse: null })
    })

    it("disposer unlistens every subscription", async () => {
      const unlisten = vi.fn()
      listenMock.mockResolvedValue(unlisten)
      const dispose = subscribeOutputEvents({
        "broadcast:mute": vi.fn(),
        "broadcast:props-update": vi.fn(),
      })
      await flush()
      dispose()
      expect(unlisten).toHaveBeenCalledTimes(2)
    })

    it("unlistens a subscription that resolves after disposal", async () => {
      const unlisten = vi.fn()
      listenMock.mockResolvedValue(unlisten)
      const dispose = subscribeOutputEvents({ "broadcast:mute": vi.fn() })
      dispose() // dispose before the listen promise resolves
      await flush()
      expect(unlisten).toHaveBeenCalledTimes(1)
    })
  })

  describe("reverse emit (output → main)", () => {
    it("emitToMain targets the main window with the payload", () => {
      const payload = {
        position: 1,
        duration: 10,
        playing: true,
        ended: false,
      }
      emitToMain(BROADCAST_EVENTS.mediaProgress, payload)
      expect(emitToMock).toHaveBeenCalledWith(
        "main",
        "broadcast:media-progress",
        payload
      )
    })

    it("emitMediaEnded sends the empty-object payload", () => {
      emitMediaEnded()
      expect(emitToMock).toHaveBeenCalledWith(
        "main",
        "broadcast:media-ended",
        {}
      )
    })

    it("emitOutputReady sends no payload", () => {
      emitOutputReady()
      expect(emitToMock).toHaveBeenCalledWith(
        "main",
        "broadcast:output-ready",
        undefined
      )
    })

    it("emitMediaProgress wraps emitToMain", () => {
      emitMediaProgress({
        position: 2,
        duration: 20,
        playing: false,
        ended: true,
      })
      expect(emitToMock).toHaveBeenCalledWith(
        "main",
        "broadcast:media-progress",
        expect.objectContaining({ position: 2 })
      )
    })
  })
})
