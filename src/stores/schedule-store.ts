import { create } from "zustand"
import { load, type Store } from "@tauri-apps/plugin-store"
import type { ServiceSchedule } from "@/types/schedule"
import type { ScheduleState, AddItemOptions } from "./schedule/types"
import { createScheduleCrudSlice } from "./schedule/schedule-crud"
import { createItemsSlice } from "./schedule/items"
import { createNavigationSlice } from "./schedule/navigation"

// The store state/action interface and the cross-slice helpers now live under
// `./schedule/*` so the store stays a thin composition. Re-exported here so
// existing `@/stores/schedule-store` imports keep resolving.
export type { ScheduleState, AddItemOptions }

/**
 * The service-schedule store, composed from domain slices under
 * `stores/schedule/`. Every slice shares the same `set`/`get` over the full
 * {@link ScheduleState}, so cross-slice calls (e.g. `addItem` calling
 * `get().flashItem()`, or `nextItem` calling `get().goToItem()`) resolve at
 * runtime exactly as they did when this was one monolithic store.
 */
export const useScheduleStore = create<ScheduleState>()((...a) => ({
  ...createScheduleCrudSlice(...a),
  ...createItemsSlice(...a),
  ...createNavigationSlice(...a),
}))

// ── Persistence via tauri-plugin-store ──

let tauriStore: Store | null = null
let hydrationPromise: Promise<void> | null = null

async function getScheduleStore(): Promise<Store> {
  if (!tauriStore) {
    tauriStore = await load("service-schedules.json", {
      autoSave: false,
      defaults: {},
    })
  }
  return tauriStore
}

export function hydrateSchedules(): Promise<void> {
  if (hydrationPromise) return hydrationPromise
  hydrationPromise = (async () => {
    try {
      const store = await getScheduleStore()
      const schedules = (await store.get("schedules")) as
        ServiceSchedule[] | undefined
      const activeId = (await store.get("activeScheduleId")) as
        string | undefined

      if (schedules && Array.isArray(schedules) && schedules.length > 0) {
        useScheduleStore.setState({ schedules })
      }
      if (activeId) {
        useScheduleStore.setState({ activeScheduleId: activeId })
      }
      const activeIdx = (await store.get("activeItemIndex")) as
        number | undefined
      if (activeIdx != null) {
        useScheduleStore.setState({ activeItemIndex: activeIdx })
      }

      useScheduleStore.subscribe((state, prevState) => {
        if (
          state.schedules !== prevState.schedules ||
          state.activeScheduleId !== prevState.activeScheduleId ||
          state.activeItemIndex !== prevState.activeItemIndex
        ) {
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(() => {
            saveTimer = null
            pendingSave = pendingSave.then(() =>
              persistSchedules(useScheduleStore.getState())
            )
          }, SAVE_DEBOUNCE_MS)
        }
      })
    } catch {
      console.warn(
        "[schedules] Failed to load persisted schedules, starting empty"
      )
    }
  })()
  return hydrationPromise
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave: Promise<void> = Promise.resolve()
const SAVE_DEBOUNCE_MS = 500

async function persistSchedules(state: ScheduleState): Promise<void> {
  try {
    const store = await getScheduleStore()
    await store.set("schedules", state.schedules)
    await store.set("activeScheduleId", state.activeScheduleId)
    await store.set("activeItemIndex", state.activeItemIndex)
    await store.save()
  } catch {
    console.warn("[schedules] Failed to persist schedules")
  }
}
