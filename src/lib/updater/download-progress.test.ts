import { describe, it, expect } from "vitest"
import {
  reduceDownloadEvent,
  initialDownloadProgress,
  toPercent,
  type DownloadProgressState,
} from "./download-progress"

describe("reduceDownloadEvent", () => {
  it("reports a determinate download when contentLength is known", () => {
    const started = reduceDownloadEvent(initialDownloadProgress, {
      event: "Started",
      data: { contentLength: 1000 },
    })
    expect(started.state).toEqual({ total: 1000, received: 0 })
    expect(started.update).toEqual({
      phase: "downloading",
      fraction: 0,
      known: true,
    })

    const half = reduceDownloadEvent(started.state, {
      event: "Progress",
      data: { chunkLength: 500 },
    })
    expect(half.state).toEqual({ total: 1000, received: 500 })
    expect(half.update).toEqual({
      phase: "downloading",
      fraction: 0.5,
      known: true,
    })
  })

  it("accumulates chunks across successive Progress events", () => {
    let state: DownloadProgressState = { total: 400, received: 0 }
    for (const chunk of [100, 100, 100]) {
      state = reduceDownloadEvent(state, {
        event: "Progress",
        data: { chunkLength: chunk },
      }).state
    }
    expect(state.received).toBe(300)
    const last = reduceDownloadEvent(state, {
      event: "Progress",
      data: { chunkLength: 100 },
    })
    expect(last.update.fraction).toBe(1)
  })

  it("clamps fraction to 1 if received overshoots total", () => {
    const { update } = reduceDownloadEvent(
      { total: 100, received: 90 },
      { event: "Progress", data: { chunkLength: 50 } }
    )
    expect(update.fraction).toBe(1)
  })

  it("marks progress indeterminate when contentLength is absent", () => {
    const started = reduceDownloadEvent(initialDownloadProgress, {
      event: "Started",
      data: {},
    })
    expect(started.state.total).toBe(0)
    expect(started.update.known).toBe(false)

    const progressed = reduceDownloadEvent(started.state, {
      event: "Progress",
      data: { chunkLength: 4096 },
    })
    // No division-by-zero pin at 0 forever: still indeterminate, fraction 0.
    expect(progressed.update).toEqual({
      phase: "downloading",
      fraction: 0,
      known: false,
    })
    expect(progressed.state.received).toBe(4096)
  })

  it("treats contentLength of 0 as indeterminate", () => {
    const { update } = reduceDownloadEvent(initialDownloadProgress, {
      event: "Started",
      data: { contentLength: 0 },
    })
    expect(update.known).toBe(false)
  })

  it("transitions to the installing phase on Finished", () => {
    const { update } = reduceDownloadEvent(
      { total: 1000, received: 1000 },
      { event: "Finished" }
    )
    expect(update).toEqual({ phase: "installing", fraction: 1, known: true })
  })
})

describe("toPercent", () => {
  it("rounds a fraction to an integer percentage", () => {
    expect(toPercent(0)).toBe(0)
    expect(toPercent(0.5)).toBe(50)
    expect(toPercent(0.756)).toBe(76)
    expect(toPercent(1)).toBe(100)
  })

  it("clamps out-of-range fractions", () => {
    expect(toPercent(-0.2)).toBe(0)
    expect(toPercent(1.4)).toBe(100)
  })
})
