import type { StateCreator } from "zustand"
import { DEFAULT_STAGE_DISPLAY_CONFIG } from "@/types/broadcast"
import { updateOutputInArray } from "@/lib/broadcast/output-selectors"
import type { BroadcastState } from "./types"

/**
 * Stage-display live state: operator notes, the countdown timer, per-monitor
 * cues (message/announcement), named monitor groups for one-tap targeting, and
 * the playlist. Every mutation re-syncs the stage outputs so the monitors update.
 * Cues are ephemeral (not persisted); groups are persisted.
 */
export type StageDisplaySlice = Pick<
  BroadcastState,
  | "stageNotes"
  | "stageTimer"
  | "stageMessages"
  | "stageAnnouncements"
  | "stageMonitorGroups"
  | "stagePlaylist"
  | "updateStageConfig"
  | "setStageNotes"
  | "setStageTimer"
  | "setStageCue"
  | "clearStageCue"
  | "addStageMonitorGroup"
  | "updateStageMonitorGroup"
  | "removeStageMonitorGroup"
  | "setStagePlaylist"
>

export const createStageDisplaySlice: StateCreator<
  BroadcastState,
  [],
  [],
  StageDisplaySlice
> = (set, get) => ({
  stageNotes: null,
  stageTimer: null,
  stageMessages: {},
  stageAnnouncements: {},
  stageMonitorGroups: [],
  stagePlaylist: null,

  updateStageConfig: (outputId, updates) => {
    set((s) => ({
      outputs: updateOutputInArray(s.outputs, outputId, {
        stageConfig: {
          ...(s.outputs.find((o) => o.id === outputId)?.stageConfig ??
            DEFAULT_STAGE_DISPLAY_CONFIG),
          ...updates,
        },
      }),
    }))
    get().syncStageOutput()
  },
  setStageNotes: (stageNotes) => {
    set({ stageNotes })
    get().syncStageOutput()
  },
  setStageTimer: (stageTimer) => {
    set({ stageTimer })
    get().syncStageOutput()
  },
  setStageCue: (outputIds, message, announcement) => {
    if (outputIds.length === 0) return
    set((s) => {
      const stageMessages = { ...s.stageMessages }
      const stageAnnouncements = { ...s.stageAnnouncements }
      for (const id of outputIds) {
        stageMessages[id] = message
        stageAnnouncements[id] = announcement
      }
      return { stageMessages, stageAnnouncements }
    })
    get().syncStageOutput()
  },
  clearStageCue: (outputIds) => {
    if (outputIds.length === 0) return
    set((s) => {
      const stageMessages = { ...s.stageMessages }
      const stageAnnouncements = { ...s.stageAnnouncements }
      for (const id of outputIds) {
        delete stageMessages[id]
        delete stageAnnouncements[id]
      }
      return { stageMessages, stageAnnouncements }
    })
    get().syncStageOutput()
  },
  addStageMonitorGroup: (name, outputIds) => {
    const id = crypto.randomUUID()
    set((s) => ({
      stageMonitorGroups: [
        ...s.stageMonitorGroups,
        { id, name, outputIds: [...outputIds] },
      ],
    }))
    return id
  },
  updateStageMonitorGroup: (id, patch) => {
    set((s) => ({
      stageMonitorGroups: s.stageMonitorGroups.map((g) =>
        g.id === id ? { ...g, ...patch } : g
      ),
    }))
  },
  removeStageMonitorGroup: (id) => {
    set((s) => ({
      stageMonitorGroups: s.stageMonitorGroups.filter((g) => g.id !== id),
    }))
  },
  setStagePlaylist: (stagePlaylist) => {
    set({ stagePlaylist })
    get().syncStageOutput()
  },
})
