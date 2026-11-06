import { describe, it, expect } from "vitest"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import type { StageLayout } from "@/types/stage-layout"
import { BUILTIN_STAGE_LAYOUTS } from "./builtin-stage-layouts"
import { migrateStageConfig } from "./migrate"
import { resolveOutputStageLayout } from "./resolve"

describe("resolveOutputStageLayout", () => {
  it("returns the named preset when stageLayoutId matches", () => {
    const preset = BUILTIN_STAGE_LAYOUTS[1] // Minimal
    const layout = resolveOutputStageLayout(
      { stageLayoutId: preset.id },
      BUILTIN_STAGE_LAYOUTS
    )
    expect(layout).toBe(preset)
  })

  it("falls back to migrating stageConfig when the id is unknown", () => {
    const layout = resolveOutputStageLayout(
      {
        stageLayoutId: "does-not-exist",
        stageConfig: DEFAULT_STAGE_DISPLAY_CONFIG,
      },
      BUILTIN_STAGE_LAYOUTS
    )
    expect(layout.displayMode).toBe("zone")
    expect(layout.zones.map((z) => z.source)).toEqual([
      "current",
      "clock",
      "notes",
    ])
  })

  it("migrates the output's own stageConfig when no id is set", () => {
    const config = { ...DEFAULT_STAGE_DISPLAY_CONFIG, showNotes: false }
    const layout = resolveOutputStageLayout({ stageConfig: config }, [])
    expect(layout.zones.some((z) => z.source === "notes")).toBe(false)
    expect(layout).toEqual(
      migrateStageConfig(config, "resolved-stage-config", 0)
    )
  })

  it("uses the global default when neither id nor config is present", () => {
    const layout = resolveOutputStageLayout({}, [])
    expect(layout).toEqual(
      migrateStageConfig(
        DEFAULT_STAGE_DISPLAY_CONFIG,
        "resolved-stage-config",
        0
      )
    )
  })

  it("prefers a named custom preset over the legacy config", () => {
    const custom: StageLayout = {
      ...BUILTIN_STAGE_LAYOUTS[0],
      id: "custom-1",
      builtin: false,
    }
    const layout = resolveOutputStageLayout(
      { stageLayoutId: "custom-1", stageConfig: DEFAULT_STAGE_DISPLAY_CONFIG },
      [...BUILTIN_STAGE_LAYOUTS, custom]
    )
    expect(layout).toBe(custom)
  })
})
