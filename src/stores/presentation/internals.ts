import type { Presentation } from "@/types/slide"
import * as history from "@/lib/presentation/history"

/**
 * Cross-slice internals for the presentation store: the id generator and the
 * undo/redo history machinery. The snapshot stacks live at module scope (shared
 * by the singleton store) and are encapsulated behind these functions so every
 * slice module operates on the one shared history rather than its own copy. The
 * stack mechanics themselves are delegated to the pure `history` helpers.
 */

/** Fresh id generator, wrapped so `crypto` stays the receiver. */
export const newId = () => crypto.randomUUID()

let undoStack: Presentation[] = []
let redoStack: Presentation[] = []

// Continuous edits (color pickers, opacity/size sliders, transition-duration
// spinners) fire `updateDraftSlide` many times per second. Snapshotting every
// tick both churns memory and floods the 50-entry stack so one drag wipes the
// whole history. Coalesce those into a single snapshot per gesture by only
// pushing once per debounce window — the same pattern the broadcast editor uses.
let lastUndoPush = 0
const UNDO_DEBOUNCE_MS = 300

/** Clear both stacks and the debounce clock — called when opening a fresh draft. */
export function resetHistory(): void {
  undoStack = []
  redoStack = []
  lastUndoPush = 0
}

export function pushUndo(current: Presentation | null): void {
  if (!current) return
  undoStack = history.pushSnapshot(undoStack, current)
  redoStack = []
}

/** Snapshot for undo, but at most once per {@link UNDO_DEBOUNCE_MS} window. */
export function pushUndoDebounced(current: Presentation | null): void {
  const now = Date.now()
  if (now - lastUndoPush <= UNDO_DEBOUNCE_MS) return
  pushUndo(current)
  lastUndoPush = now
}

/** Pop one undo step; returns the restored presentation, or null if none. */
export function applyUndo(current: Presentation): Presentation | null {
  const step = history.undo(current, undoStack, redoStack)
  if (!step) return null
  undoStack = step.undoStack
  redoStack = step.redoStack
  return step.current
}

/** Re-apply one redo step; returns the restored presentation, or null if none. */
export function applyRedo(current: Presentation): Presentation | null {
  const step = history.redo(current, undoStack, redoStack)
  if (!step) return null
  undoStack = step.undoStack
  redoStack = step.redoStack
  return step.current
}
