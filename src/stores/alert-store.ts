import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { AlertTemplate, ActiveAlert } from "@/types/alert"
import { DEFAULT_TEMPLATES } from "@/types/alert"
import { emitToAllOutputs } from "@/lib/broadcast-routing"
import { useBroadcastStore } from "./broadcast-store"

interface AlertState {
  templates: AlertTemplate[]
  activeAlerts: ActiveAlert[]
  triggerOpen: boolean

  createTemplate: (template: AlertTemplate) => void
  updateTemplate: (id: string, updates: Partial<AlertTemplate>) => void
  deleteTemplate: (id: string) => void

  showAlert: (templateId: string, message: string) => void
  dismissAlert: (alertId: string) => void
  dismissAll: () => void
  setTriggerOpen: (open: boolean) => void
}

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useAlertStore = create<AlertState>((set, get) => ({
  templates: [...DEFAULT_TEMPLATES],
  activeAlerts: [],
  triggerOpen: false,

  createTemplate: (template) =>
    set((s) => ({ templates: [...s.templates, template] })),

  updateTemplate: (id, updates) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  deleteTemplate: (id) =>
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

  showAlert: (templateId, message) => {
    const template = get().templates.find((t) => t.id === templateId)
    if (!template) return

    const alert: ActiveAlert = {
      id: crypto.randomUUID(),
      templateId,
      message: message || template.name,
      startedAt: Date.now(),
      duration: template.duration,
    }

    set((s) => ({ activeAlerts: [...s.activeAlerts, alert] }))

    const payload = { alert, template }
    emitToAllOutputs(
      useBroadcastStore.getState().outputs,
      "broadcast:alert",
      payload
    )

    if (template.duration > 0) {
      const timer = setTimeout(() => {
        get().dismissAlert(alert.id)
      }, template.duration)
      dismissTimers.set(alert.id, timer)
    }
  },

  dismissAlert: (alertId) => {
    const timer = dismissTimers.get(alertId)
    if (timer) {
      clearTimeout(timer)
      dismissTimers.delete(alertId)
    }

    set((s) => ({
      activeAlerts: s.activeAlerts.filter((a) => a.id !== alertId),
    }))

    emitToAllOutputs(
      useBroadcastStore.getState().outputs,
      "broadcast:alert-dismiss",
      { alertId }
    )
  },

  dismissAll: () => {
    for (const [id, timer] of dismissTimers) {
      clearTimeout(timer)
      dismissTimers.delete(id)
    }
    set({ activeAlerts: [] })

    emitToAllOutputs(
      useBroadcastStore.getState().outputs,
      "broadcast:alert-dismiss-all",
      {}
    )
  },

  setTriggerOpen: (triggerOpen) => set({ triggerOpen }),
}))

// ── Persistence via tauri-plugin-store (templates only) ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getAlertStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("alert-templates.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateAlertTemplates(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getAlertStore()
      const templates = (await store.get("templates")) as
        AlertTemplate[] | undefined

      if (templates && Array.isArray(templates) && templates.length > 0) {
        useAlertStore.setState({ templates })
      }

      useAlertStore.subscribe((state, prevState) => {
        if (state.templates !== prevState.templates) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistAlertTemplates(useAlertStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[alerts] Failed to load persisted alert templates, using defaults"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistAlertTemplates(state: AlertState): Promise<void> {
  try {
    const store = await getAlertStore()
    await store.set("templates", state.templates)
    await store.save()
  } catch {
    console.warn("[alerts] Failed to persist alert templates")
  }
}
