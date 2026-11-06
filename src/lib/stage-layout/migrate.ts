// Migrate the legacy fixed `StageDisplayConfig` (four toggles + colours) into a
// zone-based `StageLayout`. The zone geometry here is a faithful reproduction of
// the hard-coded rects the old `drawStageDisplay` renderer computed at
// 1920×1080 — so a migrated "Standard" layout lands byte-for-byte where the old
// stage monitor did. Pure functions over plain data; no React/Zustand/Tauri.

import type { StageDisplayConfig } from "@/types/broadcast"
import type { StageLayout, StageZone } from "@/types/stage-layout"
import type { TextStyle } from "@/types/canvas"

/** The render resolution the stage output is drawn at (broadcast-output.tsx). */
export const STAGE_RESOLUTION = { width: 1920, height: 1080 } as const

// These constants mirror drawStageDisplay in lib/stage-display-renderer.ts.
const PADDING = 20
const INFO_BAR_RATIO = 0.2 // Math.round(h * 0.2)
const CLOCK_SPLIT_RATIO = 0.35 // Math.round(infoW * 0.35) when clock+notes share

function zoneText(config: StageDisplayConfig): TextStyle {
  return {
    fontFamily: config.fontFamily,
    fontSize: config.fontSize,
    fontWeight: 400,
    color: config.textColor,
    lineHeight: 1.2,
    letterSpacing: 0,
    shadow: null,
    outline: null,
  }
}

/**
 * Compute the zones a `StageDisplayConfig` implies, positioned to match the
 * legacy renderer's container rects at the given resolution. Draw order is
 * current → clock → notes (used verbatim as `layerOrder`). The current zone
 * always spans the full content width — there is no longer a next-item preview.
 */
export function stageConfigToZones(
  config: StageDisplayConfig,
  w: number = STAGE_RESOLUTION.width,
  h: number = STAGE_RESOLUTION.height
): StageZone[] {
  const hasInfo = config.showClock || config.showNotes

  const infoBarH = hasInfo ? Math.round(h * INFO_BAR_RATIO) : 0
  const contentH = h - infoBarH - PADDING * 2
  const contentW = w - PADDING * 2
  const currentW = contentW

  const infoY = h - infoBarH - PADDING
  const infoW = contentW

  const text = zoneText(config)
  const zones: StageZone[] = []

  if (config.showCurrent) {
    zones.push({
      id: "current",
      name: "Lyrics",
      source: "current",
      x: PADDING,
      y: PADDING,
      width: currentW,
      height: contentH,
      visible: true,
      locked: false,
      label: "CURRENT",
      showHeader: true,
      text,
    })
  }

  if (config.showClock) {
    // When clock and notes share the info bar, the clock takes a 35% slice.
    const clockW = config.showNotes
      ? Math.round(infoW * CLOCK_SPLIT_RATIO)
      : infoW
    zones.push({
      id: "clock",
      name: "Clock",
      source: "clock",
      x: PADDING,
      y: infoY,
      width: clockW,
      height: infoBarH,
      visible: true,
      locked: false,
      showHeader: false,
      text,
      clockFormat: config.clockFormat,
    })
  }

  if (config.showNotes) {
    const clockW = config.showClock ? Math.round(infoW * CLOCK_SPLIT_RATIO) : 0
    zones.push({
      id: "notes",
      name: "Notes",
      source: "notes",
      x: PADDING + clockW,
      y: infoY,
      width: infoW - clockW,
      height: infoBarH,
      visible: true,
      locked: false,
      label: "NOTES",
      showHeader: true,
      text,
    })
  }

  return zones
}

/**
 * Build a full `StageLayout` from a legacy `StageDisplayConfig`. `id` and `now`
 * are injected so the function stays pure and deterministic (no crypto/Date
 * calls inside).
 */
export function migrateStageConfig(
  config: StageDisplayConfig,
  id: string,
  now: number
): StageLayout {
  const zones = stageConfigToZones(config)
  return {
    id,
    name: config.layout === "minimal" ? "Minimal" : "Standard",
    builtin: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
    resolution: { ...STAGE_RESOLUTION },
    background: {
      type: "solid",
      color: config.backgroundColor,
      gradient: null,
      image: null,
      video: null,
    },
    displayMode: "zone",
    zones,
    elements: [],
    layerOrder: zones.map((z) => z.id),
  }
}
