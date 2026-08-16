/**
 * Debounced undo-snapshot gate for continuous gestures.
 *
 * A slider drag or color-picker sweep fires many `updateDraft` calls in quick
 * succession; recording one undo snapshot per event would make a single gesture
 * take dozens of undos to reverse (CLAUDE.md gesture rule). This gate collapses
 * a burst into ONE snapshot: it only pushes when more than `debounceMs` has
 * elapsed since the last push it authorized.
 *
 * Each call to {@link createUndoDebouncer} owns its own timestamp, so the two
 * designers (theme + stage layout) get independent gates instead of the two
 * mutable module globals this replaces. `now` is passed in (not read from
 * `Date.now()`) to keep the module pure and the behavior testable.
 */
export function createUndoDebouncer(debounceMs: number) {
  // Starts at 0 so the first gesture always pushes (any real timestamp is
  // greater than `debounceMs` past 0), matching the previous module-global init.
  let lastPush = 0
  return {
    /**
     * Push an undo snapshot iff enough time has passed since the last authorized
     * push. Returns whether it pushed (handy for tests / assertions).
     */
    maybePush(now: number, push: () => void): boolean {
      if (now - lastPush > debounceMs) {
        push()
        lastPush = now
        return true
      }
      return false
    },
  }
}
