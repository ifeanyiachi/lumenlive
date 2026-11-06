import { beforeEach, describe, expect, it, vi } from "vitest"
import type { VerseRenderData } from "@/types/broadcast"

// Minimal broadcast-store stand-in: takeEditedVerseLive only reaches for these
// four members, driven through getState() like the real callers. Hoisted so the
// mock factories (which run before top-level consts) can reference them.
const { broadcastState, requireFeatureMock } = vi.hoisted(() => ({
  broadcastState: {
    isLive: false,
    setLiveVerse: vi.fn(),
    setLive: vi.fn(),
    takeToLive: vi.fn<() => string | null>(() => null),
  },
  requireFeatureMock: vi.fn(),
}))
vi.mock("@/stores/broadcast-store", () => ({
  useBroadcastStore: { getState: () => broadcastState },
}))
vi.mock("@/components/entitlements/require-feature", () => ({
  requireFeature: requireFeatureMock,
}))

import { takeEditedVerseLive } from "./use-broadcast"

const RENDER: VerseRenderData = {
  reference: "John 3:16 (KJV)",
  segments: [{ verseNumber: 16, text: "For God so loved the world" }],
}

beforeEach(() => {
  broadcastState.isLive = false
  broadcastState.setLiveVerse.mockReset()
  broadcastState.setLive.mockReset()
  broadcastState.takeToLive.mockReset().mockReturnValue(null)
  requireFeatureMock.mockReset()
})

describe("takeEditedVerseLive", () => {
  it("stages the verse, brings the output on air when off-air, and takes it live", () => {
    takeEditedVerseLive(RENDER)
    expect(broadcastState.setLiveVerse).toHaveBeenCalledWith(RENDER, "manual")
    expect(broadcastState.setLive).toHaveBeenCalledWith(true)
    expect(broadcastState.takeToLive).toHaveBeenCalledTimes(1)
    expect(requireFeatureMock).not.toHaveBeenCalled()
  })

  it("does not re-enable the output when already live", () => {
    broadcastState.isLive = true
    takeEditedVerseLive(RENDER)
    expect(broadcastState.setLive).not.toHaveBeenCalled()
    expect(broadcastState.setLiveVerse).toHaveBeenCalledWith(RENDER, "manual")
    expect(broadcastState.takeToLive).toHaveBeenCalledTimes(1)
  })

  it("surfaces an upgrade prompt when the take is blocked by entitlement", () => {
    broadcastState.takeToLive.mockReturnValue("media_video_audio")
    takeEditedVerseLive(RENDER)
    expect(requireFeatureMock).toHaveBeenCalledWith(
      "media_video_audio",
      "Video & audio output",
      undefined
    )
  })
})
