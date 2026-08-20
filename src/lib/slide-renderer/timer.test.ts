import { describe, expect, it } from "vitest"
import {
  computeTimerDisplay,
  computeTimerRemaining,
  drawTimerElement,
} from "./timer"
import { renderSlide, slideHasTimer } from "./index"
import { WARN_COLOR, DANGER_COLOR } from "@/lib/countdown/timer"
import {
  createDefaultSlide,
  createDefaultTimerElement,
  createDefaultTextElement,
  createDefaultImageElement,
  createDefaultScriptureElement,
  createDefaultShapeElement,
  createDefaultVideoElement,
} from "@/lib/slide-defaults"
import type { Slide, SlideTimerElement } from "@/types/slide"

function timer(overrides: Partial<SlideTimerElement> = {}): SlideTimerElement {
  return { ...createDefaultTimerElement(), ...overrides }
}

/**
 * Recording fake 2D context that captures each drawn call name plus, for
 * `fillText`, its text argument — enough to assert what a timer paints and to
 * prove per-frame reruns differ.
 */
function recordingCtx() {
  const calls: string[] = []
  const texts: string[] = []
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_t, prop: string) {
      if (prop === "measureText")
        return (t: string) => ({ width: t.length * 10 })
      if (prop === "canvas") return { width: 1920, height: 1080 }
      return (...args: unknown[]) => {
        calls.push(prop)
        if (prop === "fillText") texts.push(String(args[0]))
      }
    },
    set() {
      return true
    },
  }
  const ctx = new Proxy({}, handler) as unknown as CanvasRenderingContext2D
  return { ctx, calls, texts }
}

describe("computeTimerRemaining", () => {
  it("duration mode returns the configured length, ignoring now", () => {
    const el = timer({ mode: "duration", durationSeconds: 300 })
    expect(computeTimerRemaining(el, 123456)).toBe(300)
    expect(computeTimerRemaining(el)).toBe(300)
  })

  it("clock mode counts down to the target when now is injected", () => {
    // Midnight epoch; target 00:05 → 300s away.
    const midnight = new Date(2026, 0, 1, 0, 0, 0, 0).getTime()
    const el = timer({ mode: "clock", targetTime: "00:05" })
    expect(computeTimerRemaining(el, midnight)).toBeCloseTo(300, 5)
  })

  it("clock mode without now falls back to the static duration", () => {
    const el = timer({
      mode: "clock",
      targetTime: "10:00",
      durationSeconds: 42,
    })
    expect(computeTimerRemaining(el)).toBe(42)
  })
})

describe("computeTimerDisplay", () => {
  it("formats the remaining time per the display format", () => {
    expect(computeTimerDisplay(timer({ durationSeconds: 90 })).text).toBe(
      "01:30"
    )
    expect(
      computeTimerDisplay(timer({ durationSeconds: 3661, format: "hh:mm:ss" }))
        .text
    ).toBe("01:01:01")
    expect(
      computeTimerDisplay(timer({ durationSeconds: 150, format: "minutes" }))
        .text
    ).toBe("3")
  })

  it("recolors at the warn and danger thresholds", () => {
    const base = timer({
      color: "#00ff00",
      warnSeconds: 60,
      dangerSeconds: 10,
    })
    expect(computeTimerDisplay({ ...base, durationSeconds: 120 }).color).toBe(
      "#00ff00"
    )
    expect(computeTimerDisplay({ ...base, durationSeconds: 30 }).color).toBe(
      WARN_COLOR
    )
    expect(computeTimerDisplay({ ...base, durationSeconds: 5 }).color).toBe(
      DANGER_COLOR
    )
  })
})

describe("drawTimerElement", () => {
  it("paints the formatted time as fillText", () => {
    const { ctx, texts } = recordingCtx()
    drawTimerElement(ctx, timer({ durationSeconds: 65 }), 1920, 1080)
    expect(texts).toEqual(["01:05"])
  })

  it("fills a background rect only when backgroundColor is set", () => {
    const bare = recordingCtx()
    drawTimerElement(bare.ctx, timer(), 1920, 1080)
    expect(bare.calls).not.toContain("fillRect")

    const filled = recordingCtx()
    drawTimerElement(
      filled.ctx,
      timer({ backgroundColor: "#000" }),
      1920,
      1080
    )
    expect(filled.calls).toContain("fillRect")
  })

  it("re-renders a different value as wall-clock now advances (per-frame tick)", () => {
    const el = timer({ mode: "clock", targetTime: "12:00" })
    const t0 = new Date(2026, 0, 1, 11, 59, 0, 0).getTime() // 60s out
    const t1 = new Date(2026, 0, 1, 11, 59, 30, 0).getTime() // 30s out
    const a = recordingCtx()
    const b = recordingCtx()
    drawTimerElement(a.ctx, el, 1920, 1080, t0)
    drawTimerElement(b.ctx, el, 1920, 1080, t1)
    expect(a.texts).toEqual(["01:00"])
    expect(b.texts).toEqual(["00:30"])
  })
})

describe("slideHasTimer", () => {
  it("detects a timer element", () => {
    const withTimer = createDefaultSlide()
    withTimer.elements = [createDefaultTimerElement()]
    expect(slideHasTimer(withTimer)).toBe(true)

    const withText = createDefaultSlide()
    withText.elements = [createDefaultTextElement()]
    expect(slideHasTimer(withText)).toBe(false)
  })
})

describe("now option parity — existing element types unaffected", () => {
  it("renders the five non-timer element types byte-identically with or without now", () => {
    const slide: Slide = {
      ...createDefaultSlide(),
      background: { type: "solid", color: "#101010" },
      elements: [
        createDefaultTextElement(),
        createDefaultImageElement(),
        createDefaultScriptureElement(),
        createDefaultShapeElement(),
        createDefaultVideoElement(),
      ],
    }
    const bare = recordingCtx()
    renderSlide(bare.ctx, slide, 1920, 1080)
    const clocked = recordingCtx()
    renderSlide(clocked.ctx, slide, 1920, 1080, undefined, undefined, {
      now: 1_700_000_000_000,
    })
    expect(clocked.calls).toEqual(bare.calls)
    expect(clocked.texts).toEqual(bare.texts)
  })
})
