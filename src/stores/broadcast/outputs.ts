import type { StateCreator } from "zustand"
import {
  findOutput,
  resolveThemeId,
  updateOutputInArray,
} from "@/lib/broadcast/output-selectors"
import type { BroadcastState } from "./types"
import { DEFAULT_OUTPUTS, pushDisplayConfig } from "./internals"

/**
 * Output (monitor) management: the list of outputs, their routing/theme, and the
 * per-output display/surface settings. Each surface setter pushes its change to
 * the live window immediately via `pushDisplayConfig`; routing/theme changes go
 * through the sync seam so mirror outputs re-render too.
 */
export type OutputsSlice = Pick<
  BroadcastState,
  | "outputs"
  | "setActiveTheme"
  | "setAltActiveTheme"
  | "addOutput"
  | "removeOutput"
  | "updateOutput"
  | "setOutputDisplayMode"
  | "setOutputCustomResolution"
  | "setOutputCustomFit"
  | "setVerseAutoFit"
  | "setMaxVerseScale"
  | "setMinVerseFontSize"
  | "setPaginateLongVerses"
  | "getOutput"
  | "getOutputThemeId"
>

export const createOutputsSlice: StateCreator<
  BroadcastState,
  [],
  [],
  OutputsSlice
> = (set, get) => ({
  outputs: DEFAULT_OUTPUTS.map((o) => ({ ...o })),

  setActiveTheme: (themeId) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, "main", { themeId }),
    }))
    // Refresh all outputs, not just "main": any output mirroring "main"
    // inherits its theme and must re-render too.
    get().syncBroadcastOutput()
  },
  setAltActiveTheme: (themeId) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, "alt", { themeId }),
    }))
    get().syncBroadcastOutput()
  },
  addOutput: (output) => {
    set((s) => ({ outputs: [...s.outputs, output] }))
  },
  removeOutput: (outputId) => {
    if (outputId === "main") return
    set((s) => {
      // Drop the monitor's stage cue and scrub it from every group so a
      // deleted output can't linger as a stale target.
      const stageMessages = { ...s.stageMessages }
      const stageAnnouncements = { ...s.stageAnnouncements }
      delete stageMessages[outputId]
      delete stageAnnouncements[outputId]
      return {
        outputs: s.outputs.filter((o) => o.id !== outputId),
        stageMessages,
        stageAnnouncements,
        stageMonitorGroups: s.stageMonitorGroups.map((g) => ({
          ...g,
          outputIds: g.outputIds.filter((id) => id !== outputId),
        })),
      }
    })
  },
  updateOutput: (outputId, updates) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, updates),
    }))
    if (
      updates.themeId ||
      updates.mode ||
      updates.contentSource ||
      updates.stageConfig ||
      "stageLayoutId" in updates // present even when cleared to undefined
    ) {
      const output = get().outputs.find((o) => o.id === outputId)
      if (output?.mode === "stage") {
        get().syncStageOutput()
      } else {
        // Refresh all outputs: changing this output's theme/routing can also
        // change what any output mirroring it should show.
        get().syncBroadcastOutput()
      }
    }
  },
  setOutputDisplayMode: (outputId, displayMode) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, { displayMode }),
    }))
    pushDisplayConfig(get, outputId)
  },
  setOutputCustomResolution: (outputId, customResolution) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, { customResolution }),
    }))
    pushDisplayConfig(get, outputId)
  },
  setOutputCustomFit: (outputId, customFit) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, { customFit }),
    }))
    pushDisplayConfig(get, outputId)
  },
  setVerseAutoFit: (outputId, verseAutoFit) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, { verseAutoFit }),
    }))
    pushDisplayConfig(get, outputId)
  },
  setMaxVerseScale: (outputId, maxVerseScale) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, { maxVerseScale }),
    }))
    pushDisplayConfig(get, outputId)
  },
  setMinVerseFontSize: (outputId, minVerseFontSize) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, { minVerseFontSize }),
    }))
    pushDisplayConfig(get, outputId)
  },
  setPaginateLongVerses: (outputId, paginateLongVerses) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, {
        paginateLongVerses,
      }),
    }))
    // Store-side pagination setting (no output-window payload needed); applies
    // on the next verse present.
  },
  getOutput: (outputId) => findOutput(get().outputs, outputId),
  getOutputThemeId: (outputId) => resolveThemeId(get().outputs, outputId),
})
