import { describe, it, expect, vi } from "vitest"
import { createRenderLoop } from "./render-loop"

/**
 * A manual animation-frame clock: `requestFrame` queues a callback, `flush()`
 * runs exactly the frames queued at that moment (one "tick"), so tests advance
 * the loop deterministically.
 */
function fakeClock() {
  let nextId = 1
  let queued = new Map<number, FrameRequestCallback>()
  const cancelled = new Set<number>()
  return {
    requestFrame: (cb: FrameRequestCallback) => {
      const id = nextId++
      queued.set(id, cb)
      return id
    },
    cancelFrame: (h: number) => {
      cancelled.add(h)
      queued.delete(h)
    },
    /** Run one animation frame (the callbacks queued so far). */
    flush() {
      const now = queued
      queued = new Map()
      for (const [id, cb] of now) {
        if (!cancelled.has(id)) cb(0)
      }
    },
    pending: () => queued.size,
  }
}

function setup(onFrame: (shouldPush: boolean) => void) {
  const clock = fakeClock()
  const loop = createRenderLoop({
    onFrame,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  })
  return { clock, loop }
}

describe("createRenderLoop — scheduling", () => {
  it("draws once per frame while a reason is active, and stops when cleared", () => {
    const frames: boolean[] = []
    const { clock, loop } = setup((p) => frames.push(p))

    loop.activate("marquee")
    clock.flush() // frame 1
    clock.flush() // frame 2
    expect(frames).toHaveLength(2)

    loop.deactivate("marquee")
    clock.flush() // the already-scheduled frame runs but finds no reasons → no draw
    clock.flush()
    expect(frames).toHaveLength(2)
    expect(clock.pending()).toBe(0)
  })

  it("coalesces multiple reasons into a single draw per frame", () => {
    let calls = 0
    const { clock, loop } = setup(() => calls++)
    loop.activate("slideVideo")
    loop.activate("mediaLayer")
    loop.activate("countdown")
    expect(loop.size()).toBe(3)
    clock.flush()
    expect(calls).toBe(1) // one draw, not three
  })

  it("schedules at most one RAF at a time regardless of active reason count (P1)", () => {
    const { clock, loop } = setup(() => {})
    // The whole point of the coalesced loop: many overlapping animations still
    // share a single scheduled frame, never one RAF per reason.
    loop.activate("slideVideo")
    loop.activate("mediaLayer")
    loop.activate("slideAnim")
    loop.activate("marquee")
    loop.activate("countdown")
    loop.activate("themeAnim")
    loop.activate("baseVideo")
    expect(loop.size()).toBe(7)
    expect(clock.pending()).toBe(1)
    // Draining and re-scheduling keeps the invariant across frames.
    clock.flush()
    expect(clock.pending()).toBe(1)
    clock.flush()
    expect(clock.pending()).toBe(1)
  })

  it("activating an already-running reason does not stack extra frames", () => {
    let calls = 0
    const { clock, loop } = setup(() => calls++)
    loop.activate("marquee")
    loop.activate("marquee")
    loop.activate("marquee")
    clock.flush()
    expect(calls).toBe(1)
  })

  it("stop() cancels the pending frame and clears reasons", () => {
    let calls = 0
    const { clock, loop } = setup(() => calls++)
    loop.activate("baseVideo")
    loop.stop()
    expect(loop.size()).toBe(0)
    clock.flush()
    expect(calls).toBe(0)
  })
})

describe("createRenderLoop — push semantics", () => {
  it("does not push when only draw-only reasons are active", () => {
    const frames: boolean[] = []
    const { clock, loop } = setup((p) => frames.push(p))
    loop.activate("themeAnim", { push: false })
    clock.flush()
    expect(frames).toEqual([false])
  })

  it("pushes when any active reason wants a push", () => {
    const frames: boolean[] = []
    const { clock, loop } = setup((p) => frames.push(p))
    loop.activate("themeAnim", { push: false })
    loop.activate("countdown", { push: true })
    clock.flush()
    expect(frames).toEqual([true])
  })
})

describe("createRenderLoop — keepAlive timing", () => {
  it('"before": a finished reason skips its final draw', () => {
    let calls = 0
    let alive = true
    const { clock, loop } = setup(() => calls++)
    loop.activate("marquee", {
      keepAlive: () => alive,
      keepAliveTiming: "before",
    })
    clock.flush()
    expect(calls).toBe(1)
    alive = false
    clock.flush() // pruned before drawing → no draw, loop ends
    expect(calls).toBe(1)
    expect(loop.isActive("marquee")).toBe(false)
    expect(clock.pending()).toBe(0)
  })

  it('"after": a finishing reason draws one last frame', () => {
    let calls = 0
    let alive = true
    const beforeFrame = vi.fn(() => {
      // Simulate a tracker completing on this frame.
      alive = false
    })
    const { clock, loop } = setup(() => calls++)
    loop.activate("slideAnim", {
      beforeFrame,
      keepAlive: () => alive,
      keepAliveTiming: "after",
    })
    clock.flush() // beforeFrame sets alive=false, but the frame still draws
    expect(beforeFrame).toHaveBeenCalledTimes(1)
    expect(calls).toBe(1)
    // Pruned after drawing → reason gone, no further frames.
    expect(loop.isActive("slideAnim")).toBe(false)
    clock.flush()
    expect(calls).toBe(1)
  })

  it("runs beforeFrame each frame for surviving reasons", () => {
    const beforeFrame = vi.fn()
    const { clock, loop } = setup(() => {})
    loop.activate("slideAnim", { beforeFrame })
    clock.flush()
    clock.flush()
    clock.flush()
    expect(beforeFrame).toHaveBeenCalledTimes(3)
  })
})

describe("createRenderLoop — draw-rate cap", () => {
  it("throttles onFrame to minFrameIntervalMs but runs beforeFrame every RAF", () => {
    let t = 0
    const clock = fakeClock()
    const frames: boolean[] = []
    const beforeFrame = vi.fn()
    const loop = createRenderLoop({
      onFrame: (p) => frames.push(p),
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      minFrameIntervalMs: 33,
      now: () => t,
    })
    loop.activate("themeAnim", { push: false, beforeFrame })

    // Frame 1 at t=0: the first frame always draws (lastFrameTime = -Infinity).
    clock.flush()
    expect(frames).toEqual([false])

    // t=10 and t=20 are under the interval → RAF fires, draw is skipped.
    t = 10
    clock.flush()
    t = 20
    clock.flush()
    expect(frames).toEqual([false])

    // t=40 is past the interval → draws again.
    t = 40
    clock.flush()
    expect(frames).toEqual([false, false])

    // beforeFrame ran on all four RAFs regardless of the draw cap (timing intact).
    expect(beforeFrame).toHaveBeenCalledTimes(4)
    // The loop keeps a single frame scheduled across skipped and drawn frames.
    expect(clock.pending()).toBe(1)
  })

  it("defers the after-prune on a skipped frame, applying it on the next draw", () => {
    let t = 0
    let alive = true
    const clock = fakeClock()
    let calls = 0
    const loop = createRenderLoop({
      onFrame: () => calls++,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      minFrameIntervalMs: 33,
      now: () => t,
    })
    loop.activate("slideAnim", {
      keepAlive: () => alive,
      keepAliveTiming: "after",
    })

    clock.flush() // t=0: draws (calls=1), reason still alive
    expect(calls).toBe(1)

    // The animation ends, but the next RAF is under the interval → draw skipped,
    // so the "after" prune is deferred; the reason survives to draw its final frame.
    alive = false
    t = 10
    clock.flush()
    expect(calls).toBe(1)
    expect(loop.isActive("slideAnim")).toBe(true)

    // Past the interval: the final frame draws, then the after-prune removes it.
    t = 40
    clock.flush()
    expect(calls).toBe(2)
    expect(loop.isActive("slideAnim")).toBe(false)
    expect(clock.pending()).toBe(0)
  })

  it("without a cap, draws every RAF (default behavior preserved)", () => {
    const t = 0
    const clock = fakeClock()
    let calls = 0
    const loop = createRenderLoop({
      onFrame: () => calls++,
      requestFrame: clock.requestFrame,
      cancelFrame: clock.cancelFrame,
      now: () => t, // provided but unused when uncapped
    })
    loop.activate("marquee")
    clock.flush()
    clock.flush()
    clock.flush()
    expect(calls).toBe(3)
  })
})
