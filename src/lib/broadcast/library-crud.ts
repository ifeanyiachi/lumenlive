/**
 * Pure CRUD helpers shared by the theme library and the stage-layout library.
 *
 * Both libraries store a list of named, savable presets where built-ins are
 * protected (never deleted, never renamed) and customs carry pin + timestamp
 * metadata. The theme and stage-layout store slices had byte-identical copies of
 * this logic; it lives here so there is one tested implementation. The store
 * keeps its OWN side-effects (re-syncing outputs, resetting the default theme,
 * patching an in-flight draft) — these helpers are pure array transforms.
 */

/** The metadata every library preset (theme or stage layout) shares. */
export interface LibraryItem {
  id: string
  name: string
  builtin?: boolean
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

/**
 * Insert `item` if its id is new, otherwise replace the existing entry in place
 * (preserving order). Used by save actions, which double as "create or update".
 */
export function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  return items.some((i) => i.id === item.id)
    ? items.map((i) => (i.id === item.id ? item : i))
    : [...items, item]
}

/**
 * Remove a custom item by id. Built-ins are protected: a delete targeting a
 * built-in is a no-op (it stays in the list).
 */
export function removeCustomById<T extends LibraryItem>(
  items: T[],
  id: string
): T[] {
  return items.filter((i) => i.id !== id || i.builtin)
}

/**
 * Clone `source` into a new custom item: fresh id, "… Copy" name, unpinned,
 * non-built-in, and both timestamps stamped to `now`.
 */
export function duplicateItem<T extends LibraryItem>(
  source: T,
  newId: string,
  now: number
): T {
  return {
    ...source,
    id: newId,
    name: `${source.name} Copy`,
    builtin: false,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Rename a custom item. Built-ins are protected (no rename); the matched custom
 * item's `updatedAt` is bumped to `now`.
 */
export function renameCustom<T extends LibraryItem>(
  items: T[],
  id: string,
  name: string,
  now: number
): T[] {
  return items.map((i) =>
    i.id === id && !i.builtin ? { ...i, name, updatedAt: now } : i
  )
}

/**
 * Case-insensitive check for whether `name` is already used by another item in
 * the library. `excludeId` skips the item currently being saved/renamed so it
 * doesn't collide with itself. Names are trimmed before comparison. Used to keep
 * preset names unique across the library (built-ins + customs).
 */
export function isNameTaken<T extends LibraryItem>(
  items: T[],
  name: string,
  excludeId?: string
): boolean {
  const target = name.trim().toLowerCase()
  return items.some(
    (i) => i.id !== excludeId && i.name.trim().toLowerCase() === target
  )
}

/**
 * Flip an item's pinned flag (built-ins CAN be pinned — pinning only reorders
 * the library, it doesn't mutate the preset's content), bumping `updatedAt`.
 */
export function togglePinById<T extends LibraryItem>(
  items: T[],
  id: string,
  now: number
): T[] {
  return items.map((i) =>
    i.id === id ? { ...i, pinned: !i.pinned, updatedAt: now } : i
  )
}
