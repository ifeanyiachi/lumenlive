import { create } from "zustand"
import {
  getOfflineSttStatus,
  installOfflineSttModel,
  onOfflineSttInstallProgress,
  removeOfflineSttModel,
  OFFLINE_STT_MODEL_IDS,
  type OfflineSttModel,
  type OfflineSttModelStatus,
} from "@/services/offline-stt-gateway"

export interface OfflineSttDownloadState {
  status: OfflineSttModelStatus | null
  busy: boolean
  progress: number
  error: string | null
}

interface OfflineSttState {
  models: Record<OfflineSttModel, OfflineSttDownloadState>
  refreshStatus: (model: OfflineSttModel) => Promise<void>
  startDownload: (model: OfflineSttModel) => Promise<void>
  removeModel: (model: OfflineSttModel) => Promise<void>
}

const INITIAL_MODEL_STATE: OfflineSttDownloadState = {
  status: null,
  busy: false,
  progress: 0,
  error: null,
}

// Keep one listener for the lifetime of the app. Settings sections are
// unmounted when the dialog closes or when the operator switches modes, but a
// model install continues in Rust and must keep updating shared state.
let progressListenerPromise: Promise<() => void> | null = null

function ensureProgressListener(): Promise<() => void> {
  if (!progressListenerPromise) {
    progressListenerPromise = onOfflineSttInstallProgress((event) => {
      const model = (
        Object.entries(OFFLINE_STT_MODEL_IDS) as [OfflineSttModel, string][]
      ).find(([, resourceId]) => resourceId === event.resourceId)?.[0]
      if (!model || event.total <= 0) return

      useOfflineSttStore.setState((state) => ({
        models: {
          ...state.models,
          [model]: {
            ...state.models[model],
            progress: Math.min(1, event.received / event.total),
          },
        },
      }))
    }).catch((error) => {
      progressListenerPromise = null
      throw error
    })
  }
  return progressListenerPromise
}

function updateModel(
  set: (updater: (state: OfflineSttState) => Partial<OfflineSttState>) => void,
  model: OfflineSttModel,
  patch: Partial<OfflineSttDownloadState>
) {
  set((state) => ({
    models: {
      ...state.models,
      [model]: { ...state.models[model], ...patch },
    },
  }))
}

export const useOfflineSttStore = create<OfflineSttState>((set, get) => ({
  models: {
    nemotron: { ...INITIAL_MODEL_STATE },
    nemotron35: { ...INITIAL_MODEL_STATE },
  },

  refreshStatus: async (model) => {
    try {
      updateModel(set, model, { status: await getOfflineSttStatus(model) })
    } catch (error) {
      updateModel(set, model, { error: String(error) })
    }
  },

  startDownload: async (model) => {
    if (get().models[model].busy) return

    updateModel(set, model, { busy: true, progress: 0, error: null })

    // Register before invoking the native install command so the first
    // progress event cannot be missed. A listener failure should not cancel a
    // download that Rust can still complete.
    try {
      await ensureProgressListener()
    } catch {
      // The install result still updates the shared state below.
    }

    try {
      const status = await installOfflineSttModel(model)
      updateModel(set, model, { status, busy: false, progress: 1 })
    } catch (error) {
      updateModel(set, model, { busy: false, error: String(error) })
    }
  },

  removeModel: async (model) => {
    if (get().models[model].busy) return

    updateModel(set, model, { busy: true, error: null })
    try {
      await removeOfflineSttModel(model)
      const status = get().models[model].status
      updateModel(set, model, {
        status: status ? { ...status, installed: false, bytes: 0 } : status,
        busy: false,
        progress: 0,
      })
    } catch (error) {
      updateModel(set, model, { busy: false, error: String(error) })
    }
  },
}))
