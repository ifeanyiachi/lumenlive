/**
 * Pure undo/redo stack operations for the presentation editor.
 *
 * Snapshots are deep-cloned with `structuredClone` — the same strategy the
 * broadcast editor's `undo-history` and the presentation mutation helpers already
 * use. It is markedly faster than the previous `JSON.parse(JSON.stringify(...))`
 * round-trip and preserves the (plain-data) presentation faithfully; the only
 * observable difference, explicit `undefined` fields surviving instead of being
 * dropped, is inert for reads and for the JSON persistence layer. The stacks
 * themselves live in the store; these helpers just own the mechanics and stay
 * free of zustand.
 */

/** Maximum number of retained undo snapshots. */
export const UNDO_LIMIT = 50

function clone<T>(value: T): T {
  return structuredClone(value)
}

/** Result of an undo/redo step: the value to show plus both updated stacks. */
export interface HistoryStep<T> {
  current: T
  undoStack: T[]
  redoStack: T[]
}

/**
 * Append a clone of `snapshot`, keeping at most `limit` entries by dropping the
 * oldest. Callers clear the redo stack separately when recording a fresh edit.
 */
export function pushSnapshot<T>(
  undoStack: T[],
  snapshot: T,
  limit: number = UNDO_LIMIT
): T[] {
  // Guard small limits: `slice(-(limit - 1))` degenerates to `slice(0)` (the
  // whole array) at limit === 1, silently defeating the cap.
  if (limit <= 0) return []
  if (limit === 1) return [clone(snapshot)]
  return [...undoStack.slice(-(limit - 1)), clone(snapshot)]
}

/** Step back one snapshot, or `null` when there is nothing to undo. */
export function undo<T>(
  current: T,
  undoStack: T[],
  redoStack: T[]
): HistoryStep<T> | null {
  if (undoStack.length === 0) return null
  return {
    current: undoStack[undoStack.length - 1],
    undoStack: undoStack.slice(0, -1),
    redoStack: [...redoStack, clone(current)],
  }
}

/** Step forward one snapshot, or `null` when there is nothing to redo. */
export function redo<T>(
  current: T,
  undoStack: T[],
  redoStack: T[]
): HistoryStep<T> | null {
  if (redoStack.length === 0) return null
  return {
    current: redoStack[redoStack.length - 1],
    undoStack: [...undoStack, clone(current)],
    redoStack: redoStack.slice(0, -1),
  }
}
