import type { StateCreator } from "zustand"
import type { ScheduleItem } from "@/types/schedule"
import { scheduleItemKey } from "@/types/schedule"
import { shouldDedupe } from "./internals"
import type { ScheduleState } from "./types"

/**
 * Item-level CRUD within a schedule: add / insert / remove / clear / update /
 * reorder, plus selection, flash-highlight, and duplicate detection. Owns
 * `selectedItemId` and `highlightedId`. Every mutation bumps the owning
 * schedule's `updatedAt` and re-indexes `order`, matching the original store.
 */
export type ItemsSlice = Pick<
  ScheduleState,
  | "selectedItemId"
  | "highlightedId"
  | "addItem"
  | "insertItemAt"
  | "removeItem"
  | "clearItems"
  | "updateItem"
  | "reorderItem"
  | "setSelectedItem"
  | "flashItem"
  | "findDuplicate"
>

let flashTimer: ReturnType<typeof setTimeout> | null = null

export const createItemsSlice: StateCreator<
  ScheduleState,
  [],
  [],
  ItemsSlice
> = (set, get) => ({
  selectedItemId: null,
  highlightedId: null,

  addItem: (scheduleId, item, opts) => {
    if (shouldDedupe(opts)) {
      const existing = get().findDuplicate(scheduleId, item)
      if (existing) {
        get().flashItem(existing.id)
        return false
      }
    }
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === scheduleId
          ? {
              ...sc,
              updatedAt: Date.now(),
              items: [...sc.items, { ...item, order: sc.items.length }],
            }
          : sc
      ),
    }))
    return true
  },

  insertItemAt: (scheduleId, item, index, opts) => {
    if (shouldDedupe(opts)) {
      const existing = get().findDuplicate(scheduleId, item)
      if (existing) {
        get().flashItem(existing.id)
        return false
      }
    }
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const items = [...sc.items]
        items.splice(index, 0, item)
        return {
          ...sc,
          updatedAt: Date.now(),
          items: items.map((i, idx) => ({ ...i, order: idx })),
        }
      }),
    }))
    return true
  },

  removeItem: (scheduleId, itemId) =>
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === scheduleId
          ? {
              ...sc,
              updatedAt: Date.now(),
              items: sc.items
                .filter((i) => i.id !== itemId)
                .map((i, idx) => ({ ...i, order: idx })),
            }
          : sc
      ),
      selectedItemId: s.selectedItemId === itemId ? null : s.selectedItemId,
    })),

  clearItems: (scheduleId, shouldRemove) =>
    set((s) => {
      const sc = s.schedules.find((x) => x.id === scheduleId)
      if (!sc) return {}
      const activeId =
        s.activeItemIndex !== null ? sc.items[s.activeItemIndex]?.id : null
      const kept = shouldRemove ? sc.items.filter((i) => !shouldRemove(i)) : []
      const items = kept.map((i, idx) => ({ ...i, order: idx }))
      const activeIdx =
        activeId != null ? items.findIndex((i) => i.id === activeId) : -1
      return {
        schedules: s.schedules.map((x) =>
          x.id === scheduleId ? { ...x, updatedAt: Date.now(), items } : x
        ),
        activeItemIndex: activeIdx >= 0 ? activeIdx : null,
        selectedItemId: items.some((i) => i.id === s.selectedItemId)
          ? s.selectedItemId
          : null,
      }
    }),

  updateItem: (scheduleId, itemId, updates) =>
    set((s) => ({
      schedules: s.schedules.map((sc) =>
        sc.id === scheduleId
          ? {
              ...sc,
              updatedAt: Date.now(),
              items: sc.items.map((i) =>
                i.id === itemId ? ({ ...i, ...updates } as ScheduleItem) : i
              ),
            }
          : sc
      ),
    })),

  reorderItem: (scheduleId, fromIndex, toIndex) =>
    set((s) => ({
      schedules: s.schedules.map((sc) => {
        if (sc.id !== scheduleId) return sc
        const items = [...sc.items]
        const [moved] = items.splice(fromIndex, 1)
        items.splice(toIndex, 0, moved)
        return {
          ...sc,
          updatedAt: Date.now(),
          items: items.map((i, idx) => ({ ...i, order: idx })),
        }
      }),
    })),

  setSelectedItem: (selectedItemId) => set({ selectedItemId }),

  flashItem: (id) => {
    if (flashTimer) clearTimeout(flashTimer)
    set({ highlightedId: id })
    flashTimer = setTimeout(() => set({ highlightedId: null }), 1500)
  },

  findDuplicate: (scheduleId, item) => {
    const key = scheduleItemKey(item)
    if (!key) return undefined
    const schedule = get().schedules.find((sc) => sc.id === scheduleId)
    return schedule?.items.find(
      (i) => i.id !== item.id && scheduleItemKey(i) === key
    )
  },
})
