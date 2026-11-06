import { describe, it, expect, beforeEach, vi } from "vitest"
import type {
  ActiveAlert,
  AlertTemplate,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { BroadcastProp } from "@/types/broadcast"
import type { Theme } from "@/types/theme"

/**
 * Unit coverage for the operator overlay derivations, plus a cross-surface parity
 * guard: the operator "Live display" mirror must issue the SAME overlay painter
 * ops (props → alerts → countdowns, at 1920×1080, same `now`) that the audience
 * compositor's `paintOverlays` runs with a null layer filter. Both paths import
 * the painters from `./overlays`; the mock below records every call so the two
 * op-sequences can be compared directly.
 */

// Record every overlay painter call from BOTH the operator path and composeFrame.
const { calls } = vi.hoisted(() => ({
  calls: [] as { fn: string; args: unknown[] }[],
}))
vi.mock("./overlays", () => ({
  drawPropsOverlay: (...args: unknown[]) => calls.push({ fn: "props", args }),
  drawAlertOverlay: (...args: unknown[]) => calls.push({ fn: "alerts", args }),
  drawCountdownOverlay: (...args: unknown[]) =>
    calls.push({ fn: "countdowns", args }),
}))
// Content renderers are irrelevant to the overlay layer — stub to keep composeFrame
// off a real canvas.
vi.mock("@/lib/verse-renderer", () => ({ renderVerse: vi.fn() }))
vi.mock("@/lib/slide-renderer", () => ({
  renderSlide: vi.fn(),
  drawSlideElements: vi.fn(),
}))

const {
  activeOverlayProps,
  activeAlertEntries,
  activeCountdownEntries,
  overlaysNeedAnimation,
  drawOperatorOverlays,
} = await import("./operator-overlay-data")

// --- Fixtures ---------------------------------------------------------------

const prop = (over: Partial<BroadcastProp> = {}) =>
  ({
    id: "p",
    type: "text",
    active: true,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...over,
  }) as BroadcastProp
const alert = (over: Partial<ActiveAlert> = {}) =>
  ({
    id: "a",
    templateId: "tmpl",
    message: "hi",
    startedAt: 0,
    duration: 0,
    ...over,
  }) as ActiveAlert
const template = (over: Partial<AlertTemplate> = {}) =>
  ({ id: "tmpl", name: "T", ...over }) as AlertTemplate
const countdown = (over: Partial<ActiveCountdown> = {}) =>
  ({ id: "c", timerId: "tm", ...over }) as ActiveCountdown
const timer = (over: Partial<CountdownTimer> = {}) =>
  ({ id: "tm", styleMode: "custom", ...over }) as CountdownTimer
const theme = (over: Partial<Theme> = {}) =>
  ({ id: "th", type: "countdown", ...over }) as Theme

beforeEach(() => {
  calls.length = 0
})

describe("overlay derivations", () => {
  it("activeOverlayProps keeps only active props", () => {
    const kept = prop({ id: "on", active: true })
    const dropped = prop({ id: "off", active: false })
    expect(activeOverlayProps([kept, dropped])).toEqual([kept])
  })

  it("activeAlertEntries joins templates and drops orphans", () => {
    const t = template()
    const entries = activeAlertEntries(
      [alert({ id: "a1" }), alert({ id: "a2", templateId: "gone" })],
      [t]
    )
    expect(entries).toEqual([{ alert: alert({ id: "a1" }), template: t }])
  })

  it("activeCountdownEntries joins timers, resolves theme, drops orphans", () => {
    const th = theme()
    const themed = timer({ id: "tm", styleMode: "theme", themeId: "th" })
    const entries = activeCountdownEntries(
      [countdown({ id: "c1" }), countdown({ id: "c2", timerId: "gone" })],
      [themed],
      [th]
    )
    expect(entries).toEqual([
      { countdown: countdown({ id: "c1" }), timer: themed, theme: th },
    ])
  })

  it("overlaysNeedAnimation is true for a marquee or any live countdown", () => {
    expect(overlaysNeedAnimation([prop({ type: "text" })], 0)).toBe(false)
    expect(overlaysNeedAnimation([prop({ type: "marquee" })], 0)).toBe(true)
    expect(overlaysNeedAnimation([prop({ type: "text" })], 1)).toBe(true)
  })
})

describe("operator overlay op parity vs audience compositor", () => {
  const NOW = 4242
  const cache = new Map<string, HTMLImageElement>()

  // Store-shaped inputs shared by both surfaces.
  const props = [prop({ id: "on" }), prop({ id: "off", active: false })]
  const activeAlerts = [alert()]
  const templates = [template()]
  const activeCountdowns = [countdown()]
  const timers = [timer()]
  const themes = [theme()]

  // The pre-assembled arrays the audience hands its painters (what the stores emit).
  const audienceProps = activeOverlayProps(props)
  const audienceAlerts = activeAlertEntries(activeAlerts, templates)
  const audienceCountdowns = activeCountdownEntries(
    activeCountdowns,
    timers,
    themes
  )

  const recordingCtx = () =>
    new Proxy(
      {},
      { get: () => () => {}, set: () => true }
    ) as unknown as CanvasRenderingContext2D

  it("operator draws props → alerts → countdowns at 1920×1080 with the same now", () => {
    drawOperatorOverlays(
      recordingCtx(),
      1920,
      1080,
      {
        props,
        activeAlerts,
        alertTemplates: templates,
        activeCountdowns,
        timers,
        themes,
      },
      cache,
      NOW
    )

    expect(calls.map((c) => c.fn)).toEqual(["props", "alerts", "countdowns"])
    const [p, a, c] = calls
    expect(p.args.slice(1)).toEqual([1920, 1080, audienceProps, cache, NOW])
    expect(a.args.slice(1)).toEqual([1920, 1080, audienceAlerts])
    expect(c.args.slice(1)).toEqual([1920, 1080, audienceCountdowns, NOW])
  })

  it("matches the audience compositor's overlay ops byte-for-byte (null layer filter)", async () => {
    const { composeFrame } = await import("./compositor")

    // Operator ops.
    drawOperatorOverlays(
      recordingCtx(),
      1920,
      1080,
      {
        props,
        activeAlerts,
        alertTemplates: templates,
        activeCountdowns,
        timers,
        themes,
      },
      cache,
      NOW
    )
    const operatorOps = calls.map((c) => ({ fn: c.fn, args: c.args.slice(1) }))

    // Audience ops from the real compositor, same overlay state.
    calls.length = 0
    composeFrame(recordingCtx(), 1920, 1080, {
      outputMode: "normal",
      stageData: null,
      imageCache: cache,
      videoCache: new Map(),
      layerFilter: null,
      clearForeground: false,
      activeMode: "slide",
      latestSlide: null,
      latestMedia: null,
      mediaBlank: false,
      mediaVideo: null,
      mediaFit: { fit: "cover" } as never,
      slideAnimTracker: null,
      baseTheme: null,
      mediaLayer: null,
      mediaLayerImg: null,
      mediaLayerVideo: null,
      props: audienceProps,
      alerts: audienceAlerts,
      countdowns: audienceCountdowns,
      showLogo: false,
      logoImg: null,
      blackout: false,
      verseAutoFit: false,
      maxVerseScale: 1.5,
      minVerseFontSize: 40,
      frameTime: NOW,
      now: NOW,
    })
    const audienceOps = calls
      .filter(
        (c) => c.fn === "props" || c.fn === "alerts" || c.fn === "countdowns"
      )
      .map((c) => ({ fn: c.fn, args: c.args.slice(1) }))

    expect(operatorOps).toEqual(audienceOps)
  })
})
