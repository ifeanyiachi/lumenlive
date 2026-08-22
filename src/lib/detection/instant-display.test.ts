import { describe, it, expect } from "vitest"
import {
  evaluateInstantDisplay,
  initialInstantDisplayState,
  wasRecentlyDisplayed,
  type InstantDisplayOptions,
} from "./instant-display"

const opts = (over: Partial<InstantDisplayOptions> = {}): InstantDisplayOptions => ({
  enabled: true,
  confidenceThreshold: 0.5,
  cooldownMs: 1000,
  stabilityCount: 2,
  now: 0,
  ...over,
})

describe("evaluateInstantDisplay", () => {
  it("waits for the stability count before displaying", () => {
    let s = initialInstantDisplayState()

    // First sighting of the ref → not yet stable.
    let r = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ now: 0 }))
    expect(r.display).toBe(false)
    expect(r.state.pendingCount).toBe(1)
    s = r.state

    // Second consecutive sighting → stable → display.
    r = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ now: 100 }))
    expect(r.display).toBe(true)
    expect(r.state.displayedRef).toBe("John 3:16")
    expect(r.state.displayedAt).toBe(100)
  })

  it("resets the streak when the ref changes (no premature flash)", () => {
    let s = initialInstantDisplayState()
    s = evaluateInstantDisplay(s, "John 3:1", 0.9, opts({ now: 0 })).state
    // Reader completes the number: ref changes → streak restarts, no display.
    const r = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ now: 100 }))
    expect(r.display).toBe(false)
    expect(r.state.pendingCount).toBe(1)
  })

  it("never displays when disabled, but still tracks the streak", () => {
    let s = initialInstantDisplayState()
    s = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ enabled: false, now: 0 })).state
    const r = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ enabled: false, now: 100 }))
    expect(r.display).toBe(false)
    expect(r.state.pendingCount).toBe(2)
  })

  it("suppresses detections below the confidence threshold", () => {
    let s = initialInstantDisplayState()
    s = evaluateInstantDisplay(s, "John 3:16", 0.4, opts({ now: 0 })).state
    const r = evaluateInstantDisplay(s, "John 3:16", 0.4, opts({ now: 100 }))
    expect(r.display).toBe(false)
  })

  it("enforces the cooldown between displays, then allows the next", () => {
    let s = initialInstantDisplayState()
    // Display John 3:16 at t=100.
    s = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ now: 0 })).state
    s = evaluateInstantDisplay(s, "John 3:16", 0.9, opts({ now: 100 })).state
    expect(s.displayedAt).toBe(100)

    // A different stable ref within the cooldown window is suppressed.
    s = evaluateInstantDisplay(s, "Romans 8:28", 0.9, opts({ now: 300 })).state
    let r = evaluateInstantDisplay(s, "Romans 8:28", 0.9, opts({ now: 400 }))
    expect(r.display).toBe(false)
    s = r.state

    // First evaluation past the cooldown → the ref displays.
    r = evaluateInstantDisplay(s, "Romans 8:28", 0.9, opts({ now: 1500 }))
    expect(r.display).toBe(true)
    expect(r.state.displayedRef).toBe("Romans 8:28")
    expect(r.state.displayedAt).toBe(1500)
  })

  it("honors a stabilityCount of 1 (instant, no confirmation)", () => {
    const s = initialInstantDisplayState()
    const r = evaluateInstantDisplay(s, "John 1:1", 0.9, opts({ stabilityCount: 1, now: 0 }))
    expect(r.display).toBe(true)
  })
})

describe("wasRecentlyDisplayed", () => {
  it("is true for the same ref inside the cooldown, false outside or for another ref", () => {
    const s = { pendingRef: "John 3:16", pendingCount: 2, displayedRef: "John 3:16", displayedAt: 1000 }
    expect(wasRecentlyDisplayed(s, "John 3:16", 1500, 1000)).toBe(true)
    expect(wasRecentlyDisplayed(s, "John 3:16", 2500, 1000)).toBe(false) // outside cooldown
    expect(wasRecentlyDisplayed(s, "Romans 8:28", 1500, 1000)).toBe(false) // revised ref
  })
})
