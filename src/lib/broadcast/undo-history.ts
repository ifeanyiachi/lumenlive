/**
 * Pure undo/redo stack operations.
 *
 * The broadcast theme designer keeps two stacks of `BroadcastTheme` snapshots.
 * These helpers own the stack mechanics (bounded push, snapshot swap) with no
 * knowledge of zustand, so they can be tested directly and reused for any
 * snapshot type.
 */

/** Default cap on the number of retained undo snapshots. */
export const UNDO_MAX = 50

/** Result of an undo/redo step: the value to show plus both updated stacks. */
export interface HistoryStep<T> {
  /** The snapshot that should become current after the step. */
  current: T
  undoStack: T[]
  redoStack: T[]
}

/**
 * Push `snapshot` onto the undo stack, cloning it so later mutation of the live
 * value can't corrupt history. Drops the oldest entry once `max` is exceeded.
 *
 * Note: callers that record a fresh edit also clear the redo stack — that policy
 * lives in the orchestrator, not here, so this stays a single-responsibility op.
 */
export function pushSnapshot<T>(
  undoStack: T[],
  snapshot: T,
  max: number = UNDO_MAX
): T[] {
  const stack = [...undoStack, structuredClone(snapshot)]
  if (stack.length > max) stack.shift()
  return stack
}

/**
 * Step back one snapshot. Returns `null` when there is nothing to undo, leaving
 * the caller free to no-op.
 */
export function undo<T>(
  current: T,
  undoStack: T[],
  redoStack: T[]
): HistoryStep<T> | null {
  if (undoStack.length === 0) return null
  const prev = undoStack[undoStack.length - 1]
  return {
    current: prev,
    undoStack: undoStack.slice(0, -1),
    redoStack: [...redoStack, structuredClone(current)],
  }
}

/** Step forward one snapshot. Returns `null` when there is nothing to redo. */
export function redo<T>(
  current: T,
  undoStack: T[],
  redoStack: T[]
): HistoryStep<T> | null {
  if (redoStack.length === 0) return null
  const next = redoStack[redoStack.length - 1]
  return {
    current: next,
    undoStack: [...undoStack, structuredClone(current)],
    redoStack: redoStack.slice(0, -1),
  }
}
