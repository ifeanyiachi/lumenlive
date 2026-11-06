/**
 * Shared shape for the broadcast-output event registrars.
 *
 * Each `events/*.ts` module owns the listeners for one subsystem and exports a
 * `register…(rt, …)` that subscribes them and returns an `EventDisposer` — a
 * teardown that unlistens every subscription it made. `useBroadcastEvents`
 * aggregates the disposers so the window's teardown stays exhaustive and in one
 * place, exactly as the old single-effect cleanup did.
 */

import type { UnlistenFn } from "@tauri-apps/api/event"

/** Tears down one subsystem's listeners. */
export type EventDisposer = () => void

/**
 * Build a disposer from the pending `listenOutputEvent` subscriptions. Disposal
 * awaits each promise then calls its unlisten fn — mirroring the original
 * per-listener `unlistenX.then((fn) => fn())` teardown.
 */
export function disposeSubscriptions(
  subs: Array<Promise<UnlistenFn>>
): EventDisposer {
  return () => {
    for (const sub of subs) void sub.then((fn) => fn())
  }
}
