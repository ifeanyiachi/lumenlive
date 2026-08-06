import { describe, expect, it } from "vitest"
import {
  sortMarkers,
  findMarkerInDirection,
  relativeSeekTarget,
} from "./markers"
import { formatClock, resolveMediaDisplay, isAtLiveEdge } from "./transport"
import { applyMuteParam } from "./presentation"

interface Marker {
  id: string
  time: number
}
const M = (time: number): Marker => ({ id: `m${time}`, time })

describe("markers", () => {
  it("sortMarkers returns a sorted copy without mutating the input", () => {
    const input = [M(30), M(5), M(20)]
    const sorted = sortMarkers(input)
    expect(sorted.map((m) => m.time)).toEqual([5, 20, 30])
    expect(input.map((m) => m.time)).toEqual([30, 5, 20])
  })

  it("findMarkerInDirection skips the current marker via the 0.25s guard band", () => {
    const markers = [M(5), M(20), M(30)]
    // Forward: sitting exactly on 20 should skip to 30, not re-pick 20.
    expect(findMarkerInDirection(markers, 20, 1)?.time).toBe(30)
    // Backward: sitting on 20 should go to 5.
    expect(findMarkerInDirection(markers, 20, -1)?.time).toBe(5)
    // Nothing beyond the ends.
    expect(findMarkerInDirection(markers, 30, 1)).toBeUndefined()
    expect(findMarkerInDirection(markers, 5, -1)).toBeUndefined()
  })

  it("relativeSeekTarget steps ±5s and clamps at zero", () => {
    expect(relativeSeekTarget(10, 1)).toBe(15)
    expect(relativeSeekTarget(10, -1)).toBe(5)
    expect(relativeSeekTarget(2, -1)).toBe(0)
  })
})

describe("transport", () => {
  it("formatClock renders m:ss and floors negatives/non-finite to 0:00", () => {
    expect(formatClock(0)).toBe("0:00")
    expect(formatClock(65)).toBe("1:05")
    expect(formatClock(600)).toBe("10:00")
    expect(formatClock(-5)).toBe("0:00")
    expect(formatClock(NaN)).toBe("0:00")
  })

  it("resolveMediaDisplay prefers the echoed transport except while dragging", () => {
    const transport = { position: 42, duration: 100, playing: true }
    // Not dragging: echoed position wins.
    expect(
      resolveMediaDisplay({
        transport,
        dragging: false,
        localCurrent: 5,
        localDuration: 0,
        localPlaying: false,
      })
    ).toEqual({ duration: 100, current: 42, playing: true })
    // Dragging: local position wins, but echoed duration/playing still apply.
    expect(
      resolveMediaDisplay({
        transport,
        dragging: true,
        localCurrent: 5,
        localDuration: 0,
        localPlaying: false,
      })
    ).toEqual({ duration: 100, current: 5, playing: true })
  })

  it("resolveMediaDisplay falls back to local values when no transport echo", () => {
    expect(
      resolveMediaDisplay({
        transport: null,
        dragging: false,
        localCurrent: 7,
        localDuration: 30,
        localPlaying: true,
      })
    ).toEqual({ duration: 30, current: 7, playing: true })
  })

  it("isAtLiveEdge only when live, with duration, within tolerance", () => {
    expect(isAtLiveEdge(true, 100, 96)).toBe(true)
    expect(isAtLiveEdge(true, 100, 90)).toBe(false)
    expect(isAtLiveEdge(false, 100, 100)).toBe(false)
    expect(isAtLiveEdge(true, 0, 0)).toBe(false)
  })
})

describe("applyMuteParam", () => {
  it("adds mute=1 only for a muted YouTube url", () => {
    expect(applyMuteParam("https://youtu.be/x?v=1", true, true)).toContain(
      "mute=1"
    )
    expect(applyMuteParam("https://youtu.be/x", false, true)).toBe(
      "https://youtu.be/x"
    )
    expect(applyMuteParam("https://example.com", true, false)).toBe(
      "https://example.com"
    )
  })

  it("returns a malformed url unchanged", () => {
    expect(applyMuteParam("not a url", true, true)).toBe("not a url")
  })
})
