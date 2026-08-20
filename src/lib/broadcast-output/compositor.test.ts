import { describe, it, expect, beforeEach, vi } from "vitest"
import type { CompositorState } from "./compositor"
import type { BroadcastTheme, MediaLayerState } from "@/types/broadcast"
import type { Slide } from "@/types/slide"

/**
 * Golden-frame harness for the output-window compositor (S2 Phase 1).
 *
 * There is no real canvas in the test environment, so — as elsewhere in this
 * folder — "golden frame" means a deterministic *operation signature*: the exact
 * ordered sequence of drawing operations the compositor issues for a given state.
 * Same state ⇒ same ops ⇒ same pixels.
 *
 * The heavy sub-renderers (verse / slide / stage / media-fit / overlays) are
 * stubbed to a single labeled marker each, so what these tests lock is precisely
 * the COMPOSITOR's own contract — which branch runs, the black floor, the media
 * layer, the base-theme compositing, overlay order, and the logo/blackout
 * finishers — independent of each sub-renderer's internals (those have their own
 * tests). This is the net Phase 2's decomposition of `composeFrame` into
 * `renderStage/Clear/Media/Slide/Verse` must keep byte-identical.
 */

// Shared op log, populated by both the recording ctx and the sub-renderer mocks.
const { ops } = vi.hoisted(() => ({ ops: [] as string[] }))

vi.mock("@/lib/verse-renderer", () => ({
  renderVerse: vi.fn((_ctx: unknown, theme: { id: string }) => {
    ops.push(`renderVerse(${theme.id})`)
    return {} // truthy metrics — no null fallback unless a test overrides it
  }),
}))

vi.mock("@/lib/slide-renderer", () => ({
  renderSlide: vi.fn((_ctx: unknown, slide: { name: string }) => {
    ops.push(`renderSlide(${slide.name})`)
  }),
  drawSlideElements: vi.fn((_ctx: unknown, slide: { name: string }) => {
    ops.push(`drawSlideElements(${slide.name})`)
  }),
}))

vi.mock("@/lib/stage-display-renderer", () => ({
  drawStageDisplay: vi.fn(() => {
    ops.push("drawStageDisplay")
  }),
}))

vi.mock("@/lib/media-fit", () => ({
  DEFAULT_MEDIA_FIT: { fit: "cover" },
  drawMediaFitted: vi.fn((_ctx: unknown, source: { label?: string }) => {
    ops.push(`drawMediaFitted(${source.label ?? "?"})`)
  }),
}))

vi.mock("./overlays", () => ({
  drawAlertOverlay: vi.fn(() => ops.push("alerts")),
  drawCountdownOverlay: vi.fn(() => ops.push("countdowns")),
  drawPropsOverlay: vi.fn(() => ops.push("props")),
}))

// The scripture-slide seam is exercised in its own byte-parity suite; here we only
// assert the compositor routes the live verse through the slide path (flip F5).
vi.mock("./scripture-slide", () => ({
  buildScriptureSlide: vi.fn(() => ({
    slide: { name: "live-scripture" },
    scriptureContent: new Map(),
  })),
  buildScriptureContent: vi.fn(() => new Map([["s", { verse: {}, style: {} }]])),
  // The base backdrop is now painted via renderSlide over this slide (RF3a).
  buildBaseSlide: vi.fn(() => ({ name: "base", background: { type: "solid" } })),
}))

vi.mock("@/lib/slide-animation", () => ({
  isAnimationActive: vi.fn(() => false),
}))

// Imported after the mocks so the compositor binds to the stubbed sub-renderers.
const { composeFrame, composeNdiForeground } = await import("./compositor")
const { renderVerse } = await import("@/lib/verse-renderer")

const SW = 1920
const SH = 1080
const FILL_BLACK = ["fillStyle=#000", `fillRect(0,0,${SW},${SH})`]

/** A recording 2D context that logs fillStyle assignments + rect ops into `ops`. */
function recCtx(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get(_t, p: string) {
        if (p === "fillRect")
          return (x: number, y: number, w: number, h: number) =>
            ops.push(`fillRect(${x},${y},${w},${h})`)
        if (p === "clearRect")
          return (x: number, y: number, w: number, h: number) =>
            ops.push(`clearRect(${x},${y},${w},${h})`)
        return () => {}
      },
      set(_t, p: string, v: unknown) {
        if (p === "fillStyle") ops.push(`fillStyle=${v}`)
        return true
      },
    }
  ) as unknown as CanvasRenderingContext2D
}

// --- Fixtures ---------------------------------------------------------------

const opaqueTheme = (id = "theme-a") =>
  ({ id, background: { type: "solid" } }) as unknown as BroadcastTheme
const transparentTheme = (id = "theme-t") =>
  ({ id, background: { type: "transparent" } }) as unknown as BroadcastTheme
const opaqueSlide = (name = "S1") =>
  ({ name, background: { type: "solid" }, elements: [] }) as unknown as Slide
const transparentSlide = (name = "ST") =>
  ({
    name,
    background: { type: "transparent" },
    elements: [],
  }) as unknown as Slide
const imageLayer = () =>
  ({ mediaType: "image", name: "ml" }) as unknown as MediaLayerState
const labeled = <T>(label: string) => ({ label }) as unknown as T

function makeState(over: Partial<CompositorState> = {}): CompositorState {
  return {
    outputMode: "normal",
    stageData: null,
    imageCache: new Map(),
    videoCache: new Map(),
    layerFilter: null,
    clearForeground: false,
    activeMode: "verse",
    latestData: null,
    latestSlide: null,
    latestMedia: null,
    mediaBlank: false,
    mediaVideo: null,
    mediaFit: {} as CompositorState["mediaFit"],
    slideAnimTracker: null,
    baseTheme: null,
    mediaLayer: null,
    mediaLayerImg: null,
    mediaLayerVideo: null,
    props: [],
    alerts: [],
    countdowns: [],
    showLogo: false,
    logoImg: null,
    blackout: false,
    verseAutoFit: true,
    maxVerseScale: 1.5,
    minVerseFontSize: 40,
    frameTime: 0,
    now: 0,
    ...over,
  }
}

beforeEach(() => {
  ops.length = 0
  vi.mocked(renderVerse).mockClear()
  vi.mocked(renderVerse).mockImplementation(
    (_ctx: unknown, theme: { id: string }) => {
      ops.push(`renderVerse(${theme.id})`)
      return {} as ReturnType<typeof renderVerse>
    }
  )
})

// --- composeFrame: content branches -----------------------------------------

describe("composeFrame — stage mode", () => {
  it("renders the stage display and returns early (no overlays)", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        outputMode: "stage",
        stageData: labeled("stage"),
        props: [labeled("p")],
      })
    )
    expect(ops).toEqual(["drawStageDisplay"])
  })

  it("falls through to content when not in stage mode even if stageData exists", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({ outputMode: "normal", stageData: labeled("stage") })
    )
    // Verse branch with no data → black fallback + overlays, no stage draw.
    expect(ops).not.toContain("drawStageDisplay")
    expect(ops).toEqual([...FILL_BLACK, "props", "alerts", "countdowns"])
  })
})

describe("composeFrame — clear foreground", () => {
  it("paints black floor, media layer, then the base theme; overlays follow", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        clearForeground: true,
        mediaLayer: imageLayer(),
        mediaLayerImg: labeled("ml-img"),
        baseTheme: opaqueTheme("base"),
      })
    )
    expect(ops).toEqual([
      ...FILL_BLACK,
      "drawMediaFitted(ml-img)",
      "renderSlide(base)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("with no base theme, draws only the floor (base-theme paint is a no-op)", () => {
    composeFrame(recCtx(), SW, SH, makeState({ clearForeground: true }))
    expect(ops).toEqual([...FILL_BLACK, "props", "alerts", "countdowns"])
  })
})

describe("composeFrame — media mode", () => {
  it("draws the fitted media image over the black floor", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "media",
        latestMedia: { img: labeled("media-img") },
      })
    )
    expect(ops).toEqual([
      ...FILL_BLACK,
      "drawMediaFitted(media-img)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("falls back to the live video frame when there is no image and it is ready", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "media",
        mediaVideo: {
          label: "media-vid",
          readyState: 2,
        } as unknown as HTMLVideoElement,
      })
    )
    expect(ops).toContain("drawMediaFitted(media-vid)")
  })

  it("blanks (no media draw) when the video is stopped via mediaBlank", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "media",
        mediaBlank: true,
        mediaVideo: labeled("media-vid"),
      })
    )
    expect(ops).toEqual([...FILL_BLACK, "props", "alerts", "countdowns"])
  })
})

describe("composeFrame — slide mode", () => {
  it("opaque slide goes through renderSlide (no black floor)", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({ activeMode: "slide", latestSlide: { slide: opaqueSlide() } })
    )
    expect(ops).toEqual(["renderSlide(S1)", "props", "alerts", "countdowns"])
  })

  it("transparent slide composits floor → media layer → base theme → elements", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "slide",
        latestSlide: { slide: transparentSlide("ST") },
        mediaLayer: imageLayer(),
        mediaLayerImg: labeled("ml-img"),
        baseTheme: opaqueTheme("base"),
      })
    )
    expect(ops).toEqual([
      ...FILL_BLACK,
      "drawMediaFitted(ml-img)",
      "renderSlide(base)",
      "drawSlideElements(ST)",
      "props",
      "alerts",
      "countdowns",
    ])
  })
})

describe("composeFrame — verse mode", () => {
  it("no data → black fallback frame + overlays, no verse render", () => {
    composeFrame(recCtx(), SW, SH, makeState({ latestData: null }))
    expect(ops).toEqual([...FILL_BLACK, "props", "alerts", "countdowns"])
  })

  it("opaque theme renders the verse directly with no pre-fill", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
      })
    )
    expect(ops).toEqual([
      "renderVerse(theme-a)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("a live verse draws chrome via renderVerse then the verse via the slide path (flip F5)", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: {
          theme: opaqueTheme("theme-a"),
          verse: { reference: "John 3:16", segments: [] },
        },
      })
    )
    expect(ops).toEqual([
      "renderVerse(theme-a)",
      "drawSlideElements(live-scripture)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("a null chrome render skips the verse foreground and runs the black fallback", () => {
    vi.mocked(renderVerse).mockImplementationOnce(
      (_ctx: unknown, theme: { id: string }) => {
        ops.push(`renderVerse(${theme.id})`)
        return null
      }
    )
    const onNullVerse = vi.fn()
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: {
          theme: opaqueTheme("theme-a"),
          verse: { reference: "John 3:16", segments: [] },
        },
        onNullVerse,
      })
    )
    expect(onNullVerse).toHaveBeenCalledTimes(1)
    // No drawSlideElements — the foreground is skipped when the chrome render fails.
    expect(ops).toEqual([
      "renderVerse(theme-a)",
      ...FILL_BLACK,
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("transparent theme with a DIFFERENT base theme composits the base behind", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: transparentTheme("theme-t"), verse: null },
        baseTheme: opaqueTheme("base"),
        mediaLayer: imageLayer(),
        mediaLayerImg: labeled("ml-img"),
      })
    )
    expect(ops).toEqual([
      ...FILL_BLACK,
      "drawMediaFitted(ml-img)",
      "renderSlide(base)",
      "renderVerse(theme-t)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("transparent theme with the SAME id as base skips the duplicate base paint", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: transparentTheme("same"), verse: null },
        baseTheme: transparentTheme("same"),
      })
    )
    expect(ops).toEqual([
      ...FILL_BLACK,
      "renderVerse(same)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("renderVerse returning null triggers the black fallback + onNullVerse", () => {
    vi.mocked(renderVerse).mockImplementationOnce(
      (_ctx: unknown, theme: { id: string }) => {
        ops.push(`renderVerse(${theme.id})`)
        return null
      }
    )
    const onNullVerse = vi.fn()
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
        onNullVerse,
      })
    )
    expect(onNullVerse).toHaveBeenCalledTimes(1)
    expect(ops).toEqual([
      "renderVerse(theme-a)",
      ...FILL_BLACK,
      "props",
      "alerts",
      "countdowns",
    ])
  })
})

describe("composeFrame — layer filter gating", () => {
  it("hides the media layer, content, and overlays per the filter flags", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "media",
        latestMedia: { img: labeled("media-img") },
        mediaLayer: imageLayer(),
        mediaLayerImg: labeled("ml-img"),
        layerFilter: {
          showMediaLayer: false,
          showContent: false,
          showProps: false,
          showAlerts: false,
          showCountdowns: false,
        } as CompositorState["layerFilter"],
      })
    )
    // Floor only: media layer gated off, content gated off, all overlays gated.
    expect(ops).toEqual([...FILL_BLACK])
  })

  it("shows only the overlays whose flags are enabled", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
        layerFilter: {
          showMediaLayer: true,
          showContent: true,
          showProps: true,
          showAlerts: false,
          showCountdowns: true,
        } as CompositorState["layerFilter"],
      })
    )
    expect(ops).toEqual(["renderVerse(theme-a)", "props", "countdowns"])
  })
})

describe("composeFrame — logo and blackout finishers", () => {
  it("logo repaints black over content + overlays, then the fitted logo", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
        showLogo: true,
        logoImg: labeled("logo"),
      })
    )
    expect(ops).toEqual([
      "renderVerse(theme-a)",
      "props",
      "alerts",
      "countdowns",
      ...FILL_BLACK,
      "drawMediaFitted(logo)",
    ])
  })

  it("blackout is the final word, painted over everything (logo included)", () => {
    composeFrame(
      recCtx(),
      SW,
      SH,
      makeState({
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
        showLogo: true,
        logoImg: labeled("logo"),
        blackout: true,
      })
    )
    expect(ops).toEqual([
      "renderVerse(theme-a)",
      "props",
      "alerts",
      "countdowns",
      ...FILL_BLACK, // logo floor
      "drawMediaFitted(logo)",
      ...FILL_BLACK, // blackout
    ])
  })
})

// --- composeNdiForeground: the see-through (keyable) path -------------------

describe("composeNdiForeground", () => {
  it("clears, draws slide elements, then foreground overlays", () => {
    composeNdiForeground(
      recCtx(),
      SW,
      SH,
      makeState({ activeMode: "slide", latestSlide: { slide: opaqueSlide() } })
    )
    expect(ops).toEqual([
      `clearRect(0,0,${SW},${SH})`,
      "drawSlideElements(S1)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("clears, renders the verse foreground, then overlays", () => {
    composeNdiForeground(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "verse",
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
      })
    )
    expect(ops).toEqual([
      `clearRect(0,0,${SW},${SH})`,
      "renderVerse(theme-a)",
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("in media mode draws no content — only the cleared canvas + overlays", () => {
    composeNdiForeground(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "media",
        latestMedia: { img: labeled("media-img") },
      })
    )
    expect(ops).toEqual([
      `clearRect(0,0,${SW},${SH})`,
      "props",
      "alerts",
      "countdowns",
    ])
  })

  it("respects overlay filter flags on the keyed feed", () => {
    composeNdiForeground(
      recCtx(),
      SW,
      SH,
      makeState({
        activeMode: "verse",
        latestData: { theme: opaqueTheme("theme-a"), verse: null },
        layerFilter: {
          showMediaLayer: true,
          showContent: true,
          showProps: false,
          showAlerts: true,
          showCountdowns: false,
        } as CompositorState["layerFilter"],
      })
    )
    expect(ops).toEqual([
      `clearRect(0,0,${SW},${SH})`,
      "renderVerse(theme-a)",
      "alerts",
    ])
  })
})
