import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import type {
  StageDisplayConfig,
  BroadcastOutput,
  StageLayout,
  StageMonitorGroup,
} from "@/types"
import type {
  BaseBackground,
  BroadcastProp,
  MediaLayerState,
  LiveMedia,
  MediaFitUpdate,
  MediaTransportState,
  WebTransportState,
  LiveWeb,
} from "@/types/broadcast"
import * as stageEditing from "@/lib/stage-layout/editing"
import {
  buildHydrationPatch,
  type PersistedThemeData,
} from "@/lib/broadcast/persistence"
import type { BroadcastState, BroadcastSource } from "./broadcast/types"
import { DEFAULT_OUTPUTS } from "./broadcast/internals"
import { createThemeDesignerSlice } from "./broadcast/theme-designer"
import { createStageCrudSlice } from "./broadcast/stage-crud"
import { createStageDesignerSlice } from "./broadcast/stage-designer"
import { createOutputsSlice } from "./broadcast/outputs"
import { createLiveTransportSlice } from "./broadcast/live-transport"
import { createMediaPropsSlice } from "./broadcast/media-props"
import { createStageDisplaySlice } from "./broadcast/stage-display"
import { createSyncSlice } from "./broadcast/sync"

// The store state/action interface and the live-content shapes now live under
// `./broadcast/*` and `@/types/broadcast` so the content gateway and output
// window can share them without importing this store. Re-exported here so
// existing `@/stores/broadcast-store` imports keep resolving.
export type { BroadcastState, BroadcastSource }
export type {
  BroadcastProp,
  MediaLayerState,
  LiveMedia,
  MediaFitUpdate,
  MediaTransportState,
  WebTransportState,
  LiveWeb,
}

/**
 * The broadcast store, composed from domain slices under `stores/broadcast/`.
 * Every slice shares the same `set`/`get` over the full {@link BroadcastState},
 * so cross-slice calls (e.g. a CRUD action calling `get().syncStageOutput()`)
 * resolve at runtime exactly as they did when this was one monolithic store.
 */
export const useBroadcastStore = create<BroadcastState>()((...a) => ({
  ...createThemeDesignerSlice(...a),
  ...createStageCrudSlice(...a),
  ...createStageDesignerSlice(...a),
  ...createOutputsSlice(...a),
  ...createLiveTransportSlice(...a),
  ...createMediaPropsSlice(...a),
  ...createStageDisplaySlice(...a),
  ...createSyncSlice(...a),
}))

// ── Theme persistence via tauri-plugin-store ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getThemeStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("broadcast-themes.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateBroadcastThemes(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getThemeStore()
      const raw: PersistedThemeData = {
        customStageLayouts: (await store.get("customStageLayouts")) as
          StageLayout[] | undefined,
        outputs: (await store.get("outputs")) as BroadcastOutput[] | undefined,
        activeThemeId: (await store.get("activeThemeId")) as string | undefined,
        altActiveThemeId: (await store.get("altActiveThemeId")) as
          string | undefined,
        stageMonitorGroups: (await store.get("stageMonitorGroups")) as
          StageMonitorGroup[] | undefined,
        props: (await store.get("props")) as BroadcastProp[] | undefined,
        mediaLayer: (await store.get("mediaLayer")) as
          MediaLayerState | undefined,
        logoImagePath: (await store.get("logoImagePath")) as string | undefined,
        baseBackground: (await store.get("baseBackground")) as
          BaseBackground | undefined,
        baseThemeId: (await store.get("baseThemeId")) as string | undefined,
        stageDisplayConfig: (await store.get("stageDisplayConfig")) as
          (StageDisplayConfig & { enabled?: boolean }) | undefined,
      }

      const s = useBroadcastStore.getState()
      const { patch, deleteLegacyStageConfig } = buildHydrationPatch(
        raw,
        { outputs: s.outputs },
        DEFAULT_OUTPUTS,
        stageEditing.sanitizeStageLayout
      )
      if (deleteLegacyStageConfig) await store.delete("stageDisplayConfig")
      if (Object.keys(patch).length > 0) {
        useBroadcastStore.setState(patch)
      }

      // Auto-persist on changes (debounced)
      useBroadcastStore.subscribe((state, prevState) => {
        const changed =
          state.stageLayouts !== prevState.stageLayouts ||
          state.outputs !== prevState.outputs ||
          state.stageMonitorGroups !== prevState.stageMonitorGroups ||
          state.props !== prevState.props ||
          state.mediaLayer !== prevState.mediaLayer ||
          state.logoImagePath !== prevState.logoImagePath ||
          state.baseBackground !== prevState.baseBackground
        if (!changed) return
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveTimer = null
          pendingSave = pendingSave.then(() =>
            persistBroadcastThemes(useBroadcastStore.getState())
          )
        }, SAVE_DEBOUNCE_MS)
      })
    } catch {
      console.warn(
        "[broadcast] Failed to load persisted themes, using defaults"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistBroadcastThemes(state: BroadcastState): Promise<void> {
  try {
    const store = await getThemeStore()
    const customStageLayouts = state.stageLayouts.filter((l) => !l.builtin)
    // Custom themes now live in the typed Theme store (themes.json); the legacy
    // `customThemes` key in broadcast-themes.json is left untouched so the one-time
    // ingest can still read it.
    await store.set("customStageLayouts", customStageLayouts)
    await store.set("outputs", state.outputs)
    await store.set("stageMonitorGroups", state.stageMonitorGroups)
    await store.set("props", state.props)
    await store.set("mediaLayer", state.mediaLayer)
    await store.set("logoImagePath", state.logoImagePath)
    await store.set("baseBackground", state.baseBackground)
    await store.delete("baseThemeId")
    await store.delete("activeThemeId")
    await store.delete("altActiveThemeId")
    await store.save()
  } catch {
    console.warn("[broadcast] Failed to persist themes")
  }
}
