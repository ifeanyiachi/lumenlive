import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import type { BroadcastTheme } from "@/types/broadcast"
import { migrateStageConfig } from "@/lib/stage-layout/migrate"
import { makeZone } from "@/lib/stage-layout/editing"
import type { StageLayout, StageZone } from "@/types/stage-layout"
import type { ZoneSource } from "@/types/stage-layout"
import { drawStageDisplay } from "./stage-display-renderer"
import type { StageDisplayData } from "./stage-display-renderer"

// A recording Canvas2D stub. It captures the ordered primitive draw calls the
// renderer makes (with the fill/text state active at call time) so we can assert
// *where* and *what* each zone drew without a real canvas. document.createElement
// ("canvas").getContext returns null under jsdom, so with null verse/slide the
// renderer takes its text-fallback path and never touches an offscreen canvas.
interface Op {
  op: string
  text?: string
  x?: number
  y?: number
  w?: number
  h?: number
  r?: unknown
  fillStyle?: string
  font?: string
  textAlign?: string
  textBaseline?: string
}

function recordingContext() {
  const ops: Op[] = []
  const state = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
  }
  const ctx = {
    get fillStyle() {
      return state.fillStyle
    },
    set fillStyle(v: string) {
      state.fillStyle = v
    },
    get font() {
      return state.font
    },
    set font(v: string) {
      state.font = v
    },
    get textAlign() {
      return state.textAlign
    },
    set textAlign(v: string) {
      state.textAlign = v
    },
    get textBaseline() {
      return state.textBaseline
    },
    set textBaseline(v: string) {
      state.textBaseline = v
    },
    globalAlpha: 1,
    strokeStyle: "",
    fillRect: (x: number, y: number, w: number, h: number) =>
      ops.push({ op: "fillRect", x, y, w, h, fillStyle: state.fillStyle }),
    beginPath: () => {},
    roundRect: (x: number, y: number, w: number, h: number, r: unknown) =>
      ops.push({ op: "roundRect", x, y, w, h, r, fillStyle: state.fillStyle }),
    arc: (x: number, y: number) =>
      ops.push({ op: "arc", x, y, fillStyle: state.fillStyle }),
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    save: () => {},
    restore: () => {},
    measureText: (t: string) => ({ width: t.length * 7 }),
    fillText: (text: string, x: number, y: number) =>
      ops.push({
        op: "fillText",
        text,
        x,
        y,
        fillStyle: state.fillStyle,
        font: state.font,
        textAlign: state.textAlign,
        textBaseline: state.textBaseline,
      }),
    drawImage: () => ops.push({ op: "drawImage" }),
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const theme: BroadcastTheme = {
  resolution: { width: 1920, height: 1080 },
} as BroadcastTheme

function data(
  layout: StageLayout,
  notes: string | null = null
): StageDisplayData {
  return {
    layout,
    currentTheme: theme,
    currentVerse: null,
    currentSlide: null,
    nextVerse: null,
    nextSlide: null,
    notes,
  }
}

const caches = {
  img: new Map<string, HTMLImageElement>(),
  vid: new Map<string, HTMLVideoElement>(),
}

const text = (ops: Op[], t: string) => ops.find((o) => o.text === t)
const roundRects = (ops: Op[]) => ops.filter((o) => o.op === "roundRect")

describe("drawStageDisplay — zone dispatch and placement", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 0, 1, 14, 5, 9)) // 02:05:09 PM
  })
  afterEach(() => vi.useRealTimers())

  const standard = migrateStageConfig(DEFAULT_STAGE_DISPLAY_CONFIG, "s", 0)

  it("fills the whole canvas with the layout background colour", () => {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(standard), caches.img, caches.vid)
    const bg = ops.find((o) => o.op === "fillRect")
    expect(bg).toMatchObject({ x: 0, y: 0, w: 1920, h: 1080 })
    expect(bg?.fillStyle).toBe(DEFAULT_STAGE_DISPLAY_CONFIG.backgroundColor)
  })

  it("draws the current zone box, header and empty-state where the legacy renderer did", () => {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(standard), caches.img, caches.vid)
    // Container: 20,20 / 1090×824 at 0.3 alpha
    expect(roundRects(ops)).toContainEqual(
      expect.objectContaining({
        x: 20,
        y: 20,
        w: 1090,
        h: 824,
        fillStyle: "rgba(0,0,0,0.3)",
      })
    )
    expect(text(ops, "CURRENT")).toBeTruthy()
    // Empty-state centred in the preview area (below the 36px header).
    expect(text(ops, "No content")).toMatchObject({ x: 565, y: 450 })
  })

  it("draws the next zone with its dimmed empty-state", () => {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(standard), caches.img, caches.vid)
    expect(roundRects(ops)).toContainEqual(
      expect.objectContaining({
        x: 1130,
        y: 20,
        w: 770,
        h: 824,
        fillStyle: "rgba(0,0,0,0.2)",
      })
    )
    expect(text(ops, "NEXT")).toBeTruthy()
    expect(text(ops, "End of playlist")).toMatchObject({ x: 1515, y: 450 })
  })

  it("renders the clock centred with the configured format and colour", () => {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(standard), caches.img, caches.vid)
    const clock = text(ops, "02:05:09 PM")
    expect(clock).toMatchObject({
      x: 349, // 20 + 658/2
      y: 952, // 844 + 216/2
      textAlign: "center",
      fillStyle: DEFAULT_STAGE_DISPLAY_CONFIG.textColor,
    })
    expect(clock?.font).toContain("108px") // round(216 * 0.5)
  })

  it("uses 24h clock format when the zone asks for it", () => {
    const cfg = { ...DEFAULT_STAGE_DISPLAY_CONFIG, clockFormat: "24h" as const }
    const layout = migrateStageConfig(cfg, "s24", 0)
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(layout), caches.img, caches.vid)
    expect(text(ops, "14:05:09")).toBeTruthy()
    expect(text(ops, "02:05:09 PM")).toBeUndefined()
  })

  it("renders notes when present, with the NOTES label at the zone origin", () => {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(
      ctx,
      1920,
      1080,
      data(standard, "Welcome"),
      caches.img,
      caches.vid
    )
    // notes zone bg: 678,844 / 1222×216
    expect(roundRects(ops)).toContainEqual(
      expect.objectContaining({ x: 678, y: 844, w: 1222, h: 216 })
    )
    expect(text(ops, "NOTES")).toMatchObject({ x: 694, y: 856 }) // +16,+12
    expect(text(ops, "Welcome")).toMatchObject({ x: 694, y: 880 })
  })

  it("skips zones flagged not visible", () => {
    const hidden: StageLayout = {
      ...standard,
      zones: standard.zones.map((z) =>
        z.source === "next" ? { ...z, visible: false } : z
      ),
    }
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(hidden), caches.img, caches.vid)
    expect(text(ops, "NEXT")).toBeUndefined()
    expect(text(ops, "CURRENT")).toBeTruthy()
  })

  it("draws a labelled placeholder for not-yet-implemented sources", () => {
    const zone: StageZone = {
      id: "sp1",
      name: "Gap",
      source: "spacer",
      x: 100,
      y: 100,
      width: 400,
      height: 200,
      visible: true,
      locked: false,
      label: "SPACER",
    }
    const layout: StageLayout = {
      ...standard,
      zones: [zone],
      layerOrder: ["sp1"],
    }
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(layout), caches.img, caches.vid)
    expect(roundRects(ops)).toContainEqual(
      expect.objectContaining({ x: 100, y: 100, w: 400, h: 200 })
    )
    expect(text(ops, "SPACER")).toMatchObject({ x: 300, y: 200 }) // centred
  })

  it("honours layerOrder for draw sequence", () => {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(ctx, 1920, 1080, data(standard), caches.img, caches.vid)
    const iCurrent = ops.findIndex((o) => o.text === "CURRENT")
    const iNext = ops.findIndex((o) => o.text === "NEXT")
    const iClock = ops.findIndex((o) => o.text === "02:05:09 PM")
    expect(iCurrent).toBeLessThan(iNext)
    expect(iNext).toBeLessThan(iClock)
  })
})

describe("drawStageDisplay — live data sources (Phase 4)", () => {
  const BASE = new Date(2026, 0, 1, 14, 5, 9).getTime()
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(BASE))
  })
  afterEach(() => vi.useRealTimers())

  const std = migrateStageConfig(DEFAULT_STAGE_DISPLAY_CONFIG, "s", 0)

  function only(source: ZoneSource): { layout: StageLayout; zone: StageZone } {
    const zone = makeZone(source, source)
    return { layout: { ...std, zones: [zone], layerOrder: [zone.id] }, zone }
  }

  function render(layout: StageLayout, extra: Partial<StageDisplayData>) {
    const { ctx, ops } = recordingContext()
    drawStageDisplay(
      ctx,
      1920,
      1080,
      { ...data(layout), ...extra },
      caches.img,
      caches.vid
    )
    return ops
  }

  it("renders a running countdown as M:SS", () => {
    const { layout } = only("timer")
    const ops = render(layout, {
      timer: { label: "Sermon", endsAt: BASE + 90_000 },
    })
    const t = text(ops, "01:30")
    expect(t).toBeTruthy()
    expect(t?.fillStyle).toBe("#e0e0e0")
    expect(text(ops, "Sermon")).toBeTruthy() // header label from feed
  })

  it("turns the timer red inside the final minute", () => {
    const { layout } = only("timer")
    const ops = render(layout, { timer: { label: "T", endsAt: BASE + 30_000 } })
    expect(text(ops, "00:30")?.fillStyle).toBe("#ef4444")
  })

  it("shows a dash placeholder when no timer is running", () => {
    const { layout } = only("timer")
    const ops = render(layout, { timer: null })
    expect(text(ops, "--:--")).toBeTruthy()
  })

  it("renders a stage message in amber", () => {
    const { layout } = only("messages")
    const ops = render(layout, { message: "WRAP UP" })
    const m = text(ops, "WRAP UP")
    expect(m?.fillStyle).toBe("#fbbf24")
  })

  it("falls back to a placeholder when no message is set", () => {
    const { layout, zone } = only("messages")
    const ops = render(layout, { message: null })
    expect(text(ops, "WRAP UP")).toBeUndefined()
    expect(text(ops, zone.label!)).toBeTruthy()
  })

  it("renders an announcement heading and body", () => {
    const { layout } = only("announcement")
    const ops = render(layout, { announcement: "Offering" })
    expect(text(ops, "ANNOUNCEMENT")).toBeTruthy()
    expect(text(ops, "Offering")).toBeTruthy()
  })

  it("renders playlist items with the first one highlighted", () => {
    const { layout } = only("playlist")
    const ops = render(layout, { playlist: ["Song One", "Sermon"] })
    expect(text(ops, "PLAYLIST")).toBeTruthy()
    expect(text(ops, "Song One")?.fillStyle).toBe("#e0e0e0")
    expect(text(ops, "Sermon")?.fillStyle).toBe("rgba(255,255,255,0.55)")
  })

  it("shows a placeholder for an empty playlist", () => {
    const { layout, zone } = only("playlist")
    const ops = render(layout, { playlist: [] })
    expect(text(ops, zone.label!)).toBeTruthy()
  })
})
