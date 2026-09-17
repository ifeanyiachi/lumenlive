import type { ServiceSchedule, ScheduleItem } from "@/types/schedule"
import type { Presentation } from "@/types/slide"

/** Options shared by the item-adding actions. */
export interface AddItemOptions {
  /**
   * Reject the item when the schedule already contains one with the same
   * content, flash-highlighting the existing row instead. Defaults to the
   * user's `preventDuplicateScheduleItems` setting; pass `false` to force the
   * item through regardless — used for placeholders the user is about to
   * configure, which are not yet meaningfully "the same" as anything.
   */
  dedupe?: boolean
}

export interface ScheduleState {
  schedules: ServiceSchedule[]
  activeScheduleId: string | null
  activeItemIndex: number | null
  activeSlideIndex: number | null
  selectedItemId: string | null
  /** ID of the schedule item currently being flash-highlighted (null = none). */
  highlightedId: string | null
  /**
   * Transient (never persisted) cache of the deck generated for the live song
   * item, so stepping through its verses reuses one deck (stable ids) instead of
   * regenerating per step. Cleared whenever a non-song item goes live.
   */
  activeSongDeck: { itemId: string; deck: Presentation } | null

  createSchedule: (name?: string) => string
  /**
   * Add an already-parsed schedule (from an imported file) to the store and
   * return its id. The caller is responsible for giving it fresh ids — see
   * `lib/schedule-io.parseScheduleFile`.
   */
  importSchedule: (schedule: ServiceSchedule) => string
  deleteSchedule: (id: string) => void
  renameSchedule: (id: string, name: string) => void
  duplicateSchedule: (id: string) => void
  setActiveSchedule: (id: string | null) => void

  /** Adds the item and returns true, or returns false if it was a duplicate. */
  addItem: (
    scheduleId: string,
    item: ScheduleItem,
    opts?: AddItemOptions
  ) => boolean
  /** Inserts the item and returns true, or returns false if it was a duplicate. */
  insertItemAt: (
    scheduleId: string,
    item: ScheduleItem,
    index: number,
    opts?: AddItemOptions
  ) => boolean
  removeItem: (scheduleId: string, itemId: string) => void
  /**
   * Remove items from a schedule in bulk. With no predicate, clears every item;
   * with one, removes only the items it returns true for (e.g. song rows). Keeps
   * `activeItemIndex`/`selectedItemId` pointing at their items by id, nulling
   * them if those items were cleared.
   */
  clearItems: (
    scheduleId: string,
    shouldRemove?: (item: ScheduleItem) => boolean
  ) => void
  updateItem: (
    scheduleId: string,
    itemId: string,
    updates: Partial<ScheduleItem>
  ) => void
  reorderItem: (scheduleId: string, fromIndex: number, toIndex: number) => void

  setSelectedItem: (id: string | null) => void
  /** Flash-highlight a schedule item briefly (1.5 s). */
  flashItem: (id: string) => void
  /** Find an existing item in a schedule with the same content as `item`. */
  findDuplicate: (
    scheduleId: string,
    item: ScheduleItem
  ) => ScheduleItem | undefined
  /** Select an item and stage it into the Program preview (never the audience). */
  goToItem: (index: number) => Promise<void>
  nextItem: () => void
  prevItem: () => void
  /**
   * Move the selection to the next (`delta > 0`) or previous (`delta < 0`)
   * whole schedule item, skipping header rows, and stage it into the Program
   * preview. Unlike {@link nextItem}/{@link prevItem} this never steps *within* a
   * deck — it always jumps items. Shared by the schedule list's ↑/↓ keys and the
   * global N/P shortcuts. No-op past either end.
   */
  goToAdjacentItem: (delta: number) => void
  /** Stage an item, then take it to the live audience — the schedule play icon. */
  presentLive: (index: number) => Promise<void>
  /**
   * Take a specific sub-slide of a deck-bearing item (grouped slides, songs, or
   * scripture collections) straight to the live audience — the double-tap on an
   * expanded group row, mirroring {@link presentLive} for one sub-slide.
   */
  presentItemSlideLive: (index: number, slideIndex: number) => Promise<void>
  /**
   * Voice-driven schedule stepping. Steps the active item (and its sub-slides)
   * `count` times in `direction`, anchored on the live selection like
   * {@link nextItem}/{@link prevItem}. When `goLive`, pushes the newly active
   * slide straight to the audience (settings' `scheduleNavAutoLive`); otherwise
   * it only stages into Program preview. Kept separate from verse navigation —
   * this drives the schedule list, not verses.
   */
  stepSlideByVoice: (
    direction: "next" | "previous",
    count: number,
    goLive: boolean
  ) => Promise<void>
  presentItem: (item: ScheduleItem) => Promise<void>

  getActiveSchedule: () => ServiceSchedule | undefined
}
