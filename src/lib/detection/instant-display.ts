/**
 * Decides when a spoken DIRECT verse reference should auto-display from the
 * interim (partial) transcript stream — the "instant direct display" path —
 * instead of waiting for the STT final transcript (~1-2s later, once the
 * speaker pauses).
 *
 * Pure and framework-free so it can be unit-tested and reused: the caller holds
 * one `InstantDisplayState` across transcript events and performs the actual
 * display side effect. Only *complete* verse references (book + chapter + verse)
 * should be fed in — chapter-only refs are excluded by the caller.
 *
 * Guardrails mirror the finals path's safety, minus the wait:
 * - **stability**: a reference must appear in `stabilityCount` consecutive
 *   partials before it displays, so an in-progress "John 3" doesn't flash before
 *   the reader finishes "John 3:16".
 * - **cooldown**: no re-display within `cooldownMs`, so a stable ref shown once
 *   doesn't re-fire on every subsequent partial (and rapid multi-verse spans
 *   don't strobe the audience).
 * - **confidence**: below `confidenceThreshold` never displays.
 */

export interface InstantDisplayState {
  /** verse_ref seen in the most recent partial, and how many partials in a row. */
  pendingRef: string | null
  pendingCount: number
  /** the last ref actually displayed, and when (ms epoch); 0 = never. */
  displayedRef: string | null
  displayedAt: number
}

export function initialInstantDisplayState(): InstantDisplayState {
  return {
    pendingRef: null,
    pendingCount: 0,
    displayedRef: null,
    displayedAt: 0,
  }
}

export interface InstantDisplayOptions {
  /** Master gate — `directAutoDisplay && directInstantDisplay`. */
  enabled: boolean
  confidenceThreshold: number
  cooldownMs: number
  /** Consecutive partials the same ref must appear in before displaying (>= 1). */
  stabilityCount: number
  /** Current time (ms epoch); injected so the decision stays pure/testable. */
  now: number
}

export interface InstantDisplayDecision {
  display: boolean
  state: InstantDisplayState
}

/**
 * Fold a new partial direct detection into the state and decide whether to
 * display it now. Always returns the next state (even when not displaying) so
 * the caller persists the stability/cooldown bookkeeping.
 */
export function evaluateInstantDisplay(
  prev: InstantDisplayState,
  verseRef: string,
  confidence: number,
  opts: InstantDisplayOptions
): InstantDisplayDecision {
  // Update the stability streak for this ref (reset when the ref changes).
  const pendingCount = prev.pendingRef === verseRef ? prev.pendingCount + 1 : 1
  const next: InstantDisplayState = { ...prev, pendingRef: verseRef, pendingCount }

  if (!opts.enabled) return { display: false, state: next }
  if (confidence < opts.confidenceThreshold) return { display: false, state: next }
  if (pendingCount < opts.stabilityCount) return { display: false, state: next }
  // Cooldown since the last instant display (covers same-ref re-fires and
  // rapid different-ref spans alike).
  if (next.displayedAt !== 0 && opts.now - next.displayedAt < opts.cooldownMs) {
    return { display: false, state: next }
  }
  return {
    display: true,
    state: { ...next, displayedRef: verseRef, displayedAt: opts.now },
  }
}

/**
 * Was `verseRef` instant-displayed within `cooldownMs` of `now`? The finals
 * handler uses this to skip re-displaying a verse the partial path already put
 * live — while still displaying a genuinely *revised* reference (different ref).
 */
export function wasRecentlyDisplayed(
  state: InstantDisplayState,
  verseRef: string,
  now: number,
  cooldownMs: number
): boolean {
  return state.displayedRef === verseRef && now - state.displayedAt < cooldownMs
}
