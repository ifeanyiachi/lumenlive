import type {
  BroadcastTheme,
  BroadcastOutput,
  StageMonitorGroup,
  BroadcastProp,
  MediaLayerState,
  BaseBackground,
  StageDisplayConfig,
} from "@/types/broadcast"
import type { StageLayout } from "@/types/stage-layout"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import { BUILTIN_THEMES } from "@/lib/builtin-themes"
import { BUILTIN_STAGE_LAYOUTS } from "@/lib/stage-layout/builtin-stage-layouts"

/** The raw values read from persisted storage (all optional / possibly legacy). */
export interface PersistedThemeData {
  customThemes?: BroadcastTheme[]
  customStageLayouts?: StageLayout[]
  outputs?: BroadcastOutput[]
  /** Legacy: single active theme, pre-multi-output. */
  activeThemeId?: string
  /** Legacy: the alt output's active theme, pre-multi-output. */
  altActiveThemeId?: string
  stageMonitorGroups?: StageMonitorGroup[]
  props?: BroadcastProp[]
  mediaLayer?: MediaLayerState
  logoImagePath?: string
  baseBackground?: BaseBackground
  /** Legacy: theme-only base, superseded by `baseBackground`. */
  baseThemeId?: string
  /** Legacy: one global stage config, superseded by per-output `stageConfig`. */
  stageDisplayConfig?: StageDisplayConfig & { enabled?: boolean }
  defaultThemeId?: string
}

/** The subset of broadcast state that hydration restores. */
export interface HydrationPatch {
  themes?: BroadcastTheme[]
  stageLayouts?: StageLayout[]
  outputs?: BroadcastOutput[]
  defaultThemeId?: string
  stageMonitorGroups?: StageMonitorGroup[]
  props?: BroadcastProp[]
  mediaLayer?: MediaLayerState
  logoImagePath?: string
  baseBackground?: BaseBackground
}

/**
 * Pure migration: turn the raw persisted values into a state patch, applying the
 * legacy shims:
 *  - `activeThemeId`/`altActiveThemeId` → per-output `themeId`s (when no saved
 *    `outputs` exist),
 *  - a global `stageDisplayConfig` → per-output `stageConfig` (alt goes stage-mode
 *    when it was enabled); the caller deletes the legacy key when
 *    `deleteLegacyStageConfig` is returned true,
 *  - `baseThemeId` → the `{ kind: "theme" }` base-background shape,
 *  - a stale `defaultThemeId` (theme since deleted) is dropped.
 *
 * Never mutates its inputs. All I/O (load/get/delete/subscribe) stays in the
 * store; this is just the transform, so it is unit-tested in isolation.
 */
export function buildHydrationPatch(
  raw: PersistedThemeData,
  current: { outputs: BroadcastOutput[]; themes: BroadcastTheme[] },
  defaultOutputs: BroadcastOutput[],
  sanitizeStageLayout: (layout: StageLayout) => StageLayout
): { patch: HydrationPatch; deleteLegacyStageConfig: boolean } {
  const patch: HydrationPatch = {}
  let deleteLegacyStageConfig = false

  if (raw.customThemes?.length) {
    patch.themes = [...BUILTIN_THEMES, ...raw.customThemes]
  }

  if (raw.customStageLayouts?.length) {
    patch.stageLayouts = [
      ...BUILTIN_STAGE_LAYOUTS,
      ...raw.customStageLayouts.map(sanitizeStageLayout),
    ]
  }

  if (raw.outputs?.length) {
    patch.outputs = raw.outputs
  } else if (raw.activeThemeId || raw.altActiveThemeId) {
    const migrated = defaultOutputs.map((o) => ({ ...o }))
    if (raw.activeThemeId) {
      const main = migrated.find((o) => o.id === "main")
      if (main) main.themeId = raw.activeThemeId
    }
    if (raw.altActiveThemeId) {
      const alt = migrated.find((o) => o.id === "alt")
      if (alt) alt.themeId = raw.altActiveThemeId
    }
    patch.outputs = migrated
  }

  if (raw.stageDisplayConfig) {
    const { enabled, ...configWithoutEnabled } = raw.stageDisplayConfig
    const mergedConfig = {
      ...DEFAULT_STAGE_DISPLAY_CONFIG,
      ...configWithoutEnabled,
    }
    // Clone so the caller's live outputs are never mutated in place.
    const outputs = (patch.outputs ?? current.outputs).map((o) => ({ ...o }))
    if (enabled) {
      const alt = outputs.find((o) => o.id === "alt")
      if (alt) {
        alt.mode = "stage"
        alt.stageConfig = mergedConfig
      }
    }
    // Any stage-mode output missing a config inherits the migrated one.
    for (const o of outputs) {
      if (o.mode === "stage" && !o.stageConfig) o.stageConfig = mergedConfig
    }
    patch.outputs = outputs
    deleteLegacyStageConfig = true
  }

  if (raw.defaultThemeId) {
    const themePool = patch.themes ?? current.themes
    if (themePool.some((t) => t.id === raw.defaultThemeId)) {
      patch.defaultThemeId = raw.defaultThemeId
    }
  }

  if (raw.stageMonitorGroups && Array.isArray(raw.stageMonitorGroups)) {
    patch.stageMonitorGroups = raw.stageMonitorGroups
  }
  if (raw.props && Array.isArray(raw.props)) patch.props = raw.props
  if (raw.mediaLayer) patch.mediaLayer = raw.mediaLayer
  if (raw.logoImagePath) patch.logoImagePath = raw.logoImagePath
  if (raw.baseBackground) patch.baseBackground = raw.baseBackground
  else if (raw.baseThemeId) {
    patch.baseBackground = { kind: "theme", themeId: raw.baseThemeId }
  }

  return { patch, deleteLegacyStageConfig }
}
