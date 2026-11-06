import type { StateCreator } from "zustand"
import type { ServiceSchedule } from "@/types/schedule"
import { createDefaultSchedule } from "@/types/schedule"
import type { ScheduleState } from "./types"

/**
 * Schedule-level CRUD: create / import / delete / rename / duplicate / activate,
 * plus the `getActiveSchedule` selector. Owns the `schedules` list and the
 * `activeScheduleId`. Item-level mutations live in the items slice; navigation
 * lives in the navigation slice.
 */
export type ScheduleCrudSlice = Pick<
  ScheduleState,
  | "schedules"
  | "activeScheduleId"
  | "createSchedule"
  | "importSchedule"
  | "deleteSchedule"
  | "renameSchedule"
  | "duplicateSchedule"
  | "setActiveSchedule"
  | "getActiveSchedule"
>

export const createScheduleCrudSlice: StateCreator<
  ScheduleState,
  [],
  [],
  ScheduleCrudSlice
> = (set, get) => ({
  schedules: [],
  activeScheduleId: null,

  createSchedule: (name) => {
    const schedule = createDefaultSchedule(name)
    set((s) => ({ schedules: [...s.schedules, schedule] }))
    return schedule.id
  },

  importSchedule: (schedule) => {
    set((s) => ({ schedules: [...s.schedules, schedule] }))
    return schedule.id
  },

  deleteSchedule: (id) =>
    set((s) => ({
      schedules: s.schedules.filter((sc) => sc.id !== id),
      activeScheduleId: s.activeScheduleId === id ? null : s.activeScheduleId,
      activeItemIndex: s.activeScheduleId === id ? null : s.activeItemIndex,
    })),

  renameSchedule: (id, name) =>
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === id ? { ...sc, name, updatedAt: Date.now() } : sc
      ),
    })),

  duplicateSchedule: (id) => {
    const original = get().schedules.find((sc) => sc.id === id)
    if (!original) return
    const dup: ServiceSchedule = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (Copy)`,
      items: original.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ schedules: [...s.schedules, dup] }))
  },

  setActiveSchedule: (activeScheduleId) =>
    set({
      activeScheduleId,
      activeItemIndex: null,
      activeSlideIndex: null,
      selectedItemId: null,
    }),

  getActiveSchedule: () => {
    const { schedules, activeScheduleId } = get()
    return schedules.find((sc) => sc.id === activeScheduleId)
  },
})
