import { describe, expect, it } from "vitest"
import {
  formatCountdownTime,
  drawAlertOverlay,
  alertBarLayout,
  drawCountdownOverlay,
  drawPropsOverlay,
  drawTransitionFrame,
} from "./overlays"
import { toFitConfig, shouldPushNdiFrame } from "./frame"
import { DEFAULT_MEDIA_FIT } from "@/lib/media-fit"
import type {
  ActiveAlert,
  AlertTemplate,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { BroadcastProp } from "@/stores/broadcast-store"

/** Recording 2D context: records method names + fillText strings; measureText
 *  returns a length-proportional width. */
function recordingCtx() {
  const calls: string[] = []
  const texts: string[] = []
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "measureText")
        return (t: string) => ({ width: t.length * 10 })
      if (prop === "fillText")
        return (t: string) => {
          calls.push("fillText")
          texts.push(t)
        }
      if (prop === "canvas") return { width: 1920, height: 1080 }
      return (...args: unknown[]) => {
        void args
        calls.push(prop)
      }
    },
    set() {
      return true
    },
  }
  return {
    ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D,
    calls,
    texts,
  }
}

describe("formatCountdownTime", () => {
  it("defaults to mm:ss, clamping negatives to 0:00", () => {
    expect(formatCountdownTime(65, "mm:ss")).toBe("01:05")
    expect(formatCountdownTime(-3, "mm:ss")).toBe("00:00")
  })
  it("supports minutes and hh:mm:ss", () => {
    expect(formatCountdownTime(90, "minutes")).toBe("2") // ceil(90/60)
    expect(formatCountdownTime(3661, "hh:mm:ss")).toBe("01:01:01")
  })
})

describe("overlay painters", () => {
  it("drawAlertOverlay no-ops on empty and paints the message otherwise", () => {
    const empty = recordingCtx()
    drawAlertOverlay(empty.ctx, 1920, 1080, [])
    expect(empty.calls).toHaveLength(0)

    const alert = { id: "a", message: "Fire drill" } as ActiveAlert
    const template = {
      style: "bar",
      position: "bottom",
      backgroundColor: "#000",
      textColor: "#fff",
      fontSize: 40,
    } as unknown as AlertTemplate
    const r = recordingCtx()
    drawAlertOverlay(r.ctx, 1920, 1080, [{ alert, template }])
    expect(r.calls).toContain("fillRect")
    expect(r.texts).toContain("Fire drill")
  })

  it("drawAlertOverlay bar geometry stays byte-identical to the inline formula", () => {
    // Records every fillRect(x, y, w, h) so we can assert the exact bar rect.
    function rectRecordingCtx() {
      const rects: number[][] = []
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop: string) {
          if (prop === "measureText")
            return (t: string) => ({ width: t.length * 10 })
          if (prop === "fillRect")
            return (x: number, y: number, w: number, h: number) =>
              rects.push([x, y, w, h])
          if (prop === "canvas") return { width: 1920, height: 1080 }
          return () => {}
        },
        set() {
          return true
        },
      }
      return {
        ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D,
        rects,
      }
    }

    // The original inline geometry, kept here as the reference implementation.
    function referenceRect(style: string, position: string, h: number) {
      const isFullscreen = style === "fullscreen"
      const isLowerThird = style === "lower-third"
      const isTop = position === "top"
      let barH: number
      let barY: number
      if (isFullscreen) {
        barH = h
        barY = 0
      } else if (isLowerThird) {
        barH = Math.round(h / 3)
        barY = isTop ? 0 : h - barH
      } else {
        barH = Math.round(h * 0.08)
        barY = isTop ? 0 : h - barH
      }
      return { barY, barH }
    }

    for (const style of ["banner", "lower-third", "fullscreen"] as const) {
      for (const position of ["top", "bottom"] as const) {
        for (const [w, h] of [
          [1920, 1080],
          [3840, 2160],
          [1280, 720],
          [1366, 768],
        ]) {
          const template = {
            style,
            position,
            backgroundColor: "#000",
            textColor: "#fff",
            fontSize: 40,
          } as unknown as AlertTemplate
          const alert = { id: "a", message: "x" } as ActiveAlert
          const r = rectRecordingCtx()
          drawAlertOverlay(r.ctx, w, h, [{ alert, template }])
          const { barY, barH } = referenceRect(style, position, h)
          expect(r.rects[0]).toEqual([0, barY, w, barH])
        }
      }
    }
  })

  it("alertBarLayout reports the bar's proportions and anchor", () => {
    const mk = (style: string, position: string) =>
      alertBarLayout({ style, position } as unknown as AlertTemplate)
    expect(mk("fullscreen", "bottom")).toEqual({
      heightFrac: 1,
      top: false,
      fullscreen: true,
    })
    expect(mk("lower-third", "bottom")).toEqual({
      heightFrac: 1 / 3,
      top: false,
      fullscreen: false,
    })
    expect(mk("banner", "top")).toEqual({
      heightFrac: 0.08,
      top: true,
      fullscreen: false,
    })
  })

  it("drawCountdownOverlay is deterministic in the injected `now`", () => {
    const countdown = {
      id: "c",
      timerId: "t",
      mode: "duration",
      startedAt: 1000,
      durationSeconds: 60,
      state: "running",
      accumulatedPausedMs: 0,
    } as ActiveCountdown
    const timer = {
      format: "mm:ss",
      position: "center",
      fontSize: 100,
      fontFamily: "Inter",
      backgroundColor: "#000",
      textColor: "#fff",
      showLabel: false,
    } as CountdownTimer
    // now is 10s after start → 50s remaining → "00:50".
    const r = recordingCtx()
    drawCountdownOverlay(r.ctx, 1920, 1080, [{ countdown, timer }], 11000)
    expect(r.texts).toContain("00:50")
  })

  it("drawCountdownOverlay draws a progress ring in fullscreen mode", () => {
    const countdown = {
      id: "c",
      timerId: "t",
      mode: "duration",
      startedAt: 1000,
      durationSeconds: 60,
      state: "running",
      accumulatedPausedMs: 0,
    } as ActiveCountdown
    const timer = {
      format: "mm:ss",
      position: "fullscreen",
      fontSize: 100,
      fontFamily: "Inter",
      backgroundColor: "#000",
      textColor: "#fff",
      showLabel: true,
      label: "Starting Soon",
      endAction: "flash",
    } as CountdownTimer
    const r = recordingCtx()
    drawCountdownOverlay(r.ctx, 1920, 1080, [{ countdown, timer }], 11000)
    // Fullscreen scrims the frame, strokes the ring arc, and prints the time.
    expect(r.calls).toContain("fillRect")
    expect(r.calls).toContain("arc")
    expect(r.calls).toContain("stroke")
    expect(r.texts).toContain("00:50")
    expect(r.texts).toContain("Starting Soon")
  })

  it("drawPropsOverlay paints text props and no-ops on empty", () => {
    const empty = recordingCtx()
    drawPropsOverlay(empty.ctx, 1920, 1080, [], new Map())
    expect(empty.calls).toHaveLength(0)

    const prop = {
      id: "p",
      type: "text",
      x: 0,
      y: 0,
      width: 50,
      height: 20,
      text: "Hi",
    } as BroadcastProp
    const r = recordingCtx()
    drawPropsOverlay(r.ctx, 1920, 1080, [prop], new Map())
    expect(r.texts).toContain("Hi")
  })

  it("drawPropsOverlay clips and scrolls a marquee, advancing with `now`", () => {
    const marquee = {
      id: "m",
      type: "marquee",
      x: 0,
      y: 90,
      width: 100,
      height: 8,
      text: "Scroll me",
      fontSize: 32,
      scrollSpeed: 120,
      scrollDirection: "left",
    } as BroadcastProp

    // Records the x of every fillText so we can prove the offset moves.
    function xRecordingCtx() {
      const xs: number[] = []
      const handler: ProxyHandler<Record<string, unknown>> = {
        get(_t, prop: string) {
          if (prop === "measureText")
            return (t: string) => ({ width: t.length * 10 })
          if (prop === "fillText") return (_t: string, x: number) => xs.push(x)
          if (prop === "canvas") return { width: 1920, height: 1080 }
          return () => {}
        },
        set() {
          return true
        },
      }
      return {
        ctx: new Proxy({}, handler) as unknown as CanvasRenderingContext2D,
        xs,
      }
    }

    const a = xRecordingCtx()
    drawPropsOverlay(a.ctx, 1920, 1080, [marquee], new Map(), 0)
    expect(a.xs.length).toBeGreaterThan(0)

    // A small time step (< one period) shifts every copy left for "left" dir.
    const b = xRecordingCtx()
    drawPropsOverlay(b.ctx, 1920, 1080, [marquee], new Map(), 100)
    expect(b.xs[0]).toBeLessThan(a.xs[0])

    // Empty marquee text draws nothing.
    const empty = recordingCtx()
    drawPropsOverlay(
      empty.ctx,
      1920,
      1080,
      [{ ...marquee, text: "" }],
      new Map(),
      0
    )
    expect(empty.texts).toHaveLength(0)
  })

  it("drawTransitionFrame no-ops without a snapshot, draws it with one", () => {
    const noPrev = recordingCtx()
    drawTransitionFrame(noPrev.ctx, 1920, 1080, 0.5, "fade", null)
    expect(noPrev.calls).toHaveLength(0)

    const prev = {} as HTMLCanvasElement
    const r = recordingCtx()
    drawTransitionFrame(r.ctx, 1920, 1080, 0.5, "fade", prev)
    expect(r.calls).toContain("drawImage")
  })
})

describe("frame helpers", () => {
  it("toFitConfig fills defaults and passes through provided fields", () => {
    expect(toFitConfig({})).toEqual(DEFAULT_MEDIA_FIT)
    const custom = toFitConfig({ zoom: 2, containBackgroundColor: "#123456" })
    expect(custom.zoom).toBe(2)
    expect(custom.backgroundColor).toBe("#123456")
    expect(custom.fit).toBe(DEFAULT_MEDIA_FIT.fit)
  })

  it("shouldPushNdiFrame gates by fps interval unless forced", () => {
    // force always pushes regardless of timing.
    expect(shouldPushNdiFrame(1000, 1000, 24, true)).toBe(true)
    // 24fps → ~41.6ms interval (minus 2ms slack). 10ms since last push → skip.
    expect(shouldPushNdiFrame(1010, 1000, 24, false)).toBe(false)
    // 50ms since last push → allowed.
    expect(shouldPushNdiFrame(1050, 1000, 24, false)).toBe(true)
    // fps 0 falls back to 24.
    expect(shouldPushNdiFrame(1050, 1000, 0, false)).toBe(true)
  })
})
