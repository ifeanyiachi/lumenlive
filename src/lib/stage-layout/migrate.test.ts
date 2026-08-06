import { describe, it, expect } from "vitest"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import type { StageDisplayConfig } from "@/types/broadcast"
import {
  stageConfigToZones,
  migrateStageConfig,
  STAGE_RESOLUTION,
} from "./migrate"

function config(
  overrides: Partial<StageDisplayConfig> = {}
): StageDisplayConfig {
  return { ...DEFAULT_STAGE_DISPLAY_CONFIG, ...overrides }
}

/** Look up a zone's rect by source, or undefined if the zone isn't present. */
function rect(zones: ReturnType<typeof stageConfigToZones>, source: string) {
  const z = zones.find((z) => z.source === source)
  return z && { x: z.x, y: z.y, width: z.width, height: z.height }
}

describe("stageConfigToZones — geometry (1920×1080)", () => {
  it("places current (full-width) + clock + notes where the renderer expects", () => {
    const zones = stageConfigToZones(config()) // all zones on
    expect(zones.map((z) => z.source)).toEqual(["current", "clock", "notes"])
    // Hand-computed from the renderer constants:
    // infoBarH = round(1080*0.2)=216; contentH = 1080-216-40 = 824
    // contentW = 1880; current now spans the full content width (no next zone)
    // infoY = 844; clockW = round(1880*0.35)=658
    expect(rect(zones, "current")).toEqual({
      x: 20,
      y: 20,
      width: 1880,
      height: 824,
    })
    expect(rect(zones, "clock")).toEqual({
      x: 20,
      y: 844,
      width: 658,
      height: 216,
    })
    expect(rect(zones, "notes")).toEqual({
      x: 678,
      y: 844,
      width: 1222,
      height: 216,
    })
  })

  it("current fills the full canvas content when the info bar is off", () => {
    const zones = stageConfigToZones(
      config({ showClock: false, showNotes: false })
    )
    expect(zones.map((z) => z.source)).toEqual(["current"])
    // no info bar → contentH = 1080-40 = 1040; currentW = 1880
    expect(rect(zones, "current")).toEqual({
      x: 20,
      y: 20,
      width: 1880,
      height: 1040,
    })
  })

  it("clock takes the whole info bar when notes are off", () => {
    const zones = stageConfigToZones(config({ showNotes: false }))
    expect(rect(zones, "clock")).toEqual({
      x: 20,
      y: 844,
      width: 1880,
      height: 216,
    })
    expect(rect(zones, "notes")).toBeUndefined()
  })

  it("notes take the whole info bar when clock is off", () => {
    const zones = stageConfigToZones(config({ showClock: false }))
    expect(rect(zones, "notes")).toEqual({
      x: 20,
      y: 844,
      width: 1880,
      height: 216,
    })
    expect(rect(zones, "clock")).toBeUndefined()
  })

  it("clock and notes tile the info bar with no gap or overlap", () => {
    const zones = stageConfigToZones(config())
    const clock = rect(zones, "clock")!
    const notes = rect(zones, "notes")!
    expect(clock.x + clock.width).toBe(notes.x) // adjacent
    expect(clock.y).toBe(notes.y)
    expect(clock.height).toBe(notes.height)
  })

  it("carries font/colour from the config onto text-bearing zones", () => {
    const zones = stageConfigToZones(
      config({ fontFamily: "Georgia", fontSize: 40, textColor: "#abcdef" })
    )
    for (const z of zones) {
      expect(z.text?.fontFamily).toBe("Georgia")
      expect(z.text?.fontSize).toBe(40)
      expect(z.text?.color).toBe("#abcdef")
    }
  })
})

describe("migrateStageConfig", () => {
  it("wraps zones in a zone-mode layout with a solid background", () => {
    const layout = migrateStageConfig(config(), "id-1", 123)
    expect(layout.id).toBe("id-1")
    expect(layout.createdAt).toBe(123)
    expect(layout.updatedAt).toBe(123)
    expect(layout.displayMode).toBe("zone")
    expect(layout.elements).toEqual([])
    expect(layout.resolution).toEqual(STAGE_RESOLUTION)
    expect(layout.background).toEqual({
      type: "solid",
      color: DEFAULT_STAGE_DISPLAY_CONFIG.backgroundColor,
      gradient: null,
      image: null,
      video: null,
    })
  })

  it("names by the legacy layout flag and orders layers by draw order", () => {
    expect(migrateStageConfig(config(), "a", 0).name).toBe("Standard")
    expect(migrateStageConfig(config({ layout: "minimal" }), "b", 0).name).toBe(
      "Minimal"
    )
    const layout = migrateStageConfig(config(), "c", 0)
    expect(layout.layerOrder).toEqual(layout.zones.map((z) => z.id))
  })

  it("is deterministic — no hidden Date/crypto calls", () => {
    const a = migrateStageConfig(config(), "same", 999)
    const b = migrateStageConfig(config(), "same", 999)
    expect(a).toEqual(b)
  })
})
