// Resolve a broadcast output to the concrete `StageLayout` it should render.
//
// The stage output can point at a named preset (`stageLayoutId`) or carry only
// the legacy fixed `stageConfig`. This is the single place that decision is
// made, so both the emit path (broadcast-store) and any preview code resolve a
// layout the same way. Pure over plain data — no React/Zustand/Tauri.

import type { BroadcastOutput, StageDisplayConfig } from "@/types/broadcast"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import type { StageLayout } from "@/types/stage-layout"
import { migrateStageConfig } from "./migrate"

/**
 * Return the `StageLayout` an output should render:
 *
 *  1. If the output names a preset (`stageLayoutId`) that exists → that preset.
 *  2. Otherwise migrate the output's legacy `stageConfig` (or the global
 *     default) into an equivalent layout, so a never-configured stage output
 *     still renders exactly like the old fixed monitor.
 *
 * The migrated fallback uses a fixed id/timestamp — it's a transient render
 * input, never persisted, so determinism matters more than uniqueness.
 */
export function resolveOutputStageLayout(
  output: Pick<BroadcastOutput, "stageLayoutId" | "stageConfig">,
  stageLayouts: StageLayout[]
): StageLayout {
  if (output.stageLayoutId) {
    const found = stageLayouts.find((l) => l.id === output.stageLayoutId)
    if (found) return found
  }
  const config: StageDisplayConfig =
    output.stageConfig ?? DEFAULT_STAGE_DISPLAY_CONFIG
  return migrateStageConfig(config, "resolved-stage-config", 0)
}
