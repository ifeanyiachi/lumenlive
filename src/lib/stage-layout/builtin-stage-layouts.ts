// Built-in Stage Layout presets. These are the stage-side equivalent of
// BUILTIN_THEMES: always present, non-deletable, and the fallback when a
// stage-mode output has no custom layout assigned.
//
// Both are derived from the legacy defaults via `migrateStageConfig` so the
// out-of-the-box stage monitor looks exactly like it did before Stage Layouts
// existed. `createdAt`/`updatedAt` are fixed (0) since built-ins are constants.

import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import type { StageDisplayConfig } from "@/types/broadcast"
import type { StageLayout } from "@/types/stage-layout"
import { migrateStageConfig } from "./migrate"

const STANDARD_CONFIG: StageDisplayConfig = { ...DEFAULT_STAGE_DISPLAY_CONFIG }

// Minimal: just the current content + a clock. No next preview, no notes.
const MINIMAL_CONFIG: StageDisplayConfig = {
  ...DEFAULT_STAGE_DISPLAY_CONFIG,
  layout: "minimal",
  showNext: false,
  showNotes: false,
}

function builtin(
  config: StageDisplayConfig,
  id: string,
  name: string
): StageLayout {
  return { ...migrateStageConfig(config, id, 0), name, builtin: true }
}

export const BUILTIN_STAGE_LAYOUTS: StageLayout[] = [
  builtin(STANDARD_CONFIG, "stage-standard", "Standard"),
  builtin(MINIMAL_CONFIG, "stage-minimal", "Minimal"),
]
