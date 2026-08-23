/**
 * Pure download-progress accumulation for the self-update flow. The Tauri
 * updater plugin streams `Started` / `Progress` / `Finished` events during
 * `downloadAndInstall`; this reduces that raw event stream into the serializable
 * shape the store and UI need.
 *
 * Two things this handles that the naive inline math didn't, and that caused the
 * "it downloads silently and looks stuck" bug in production:
 *
 *  1. **Unknown content length.** On some platforms/servers the `Started` event
 *     carries no `contentLength` (or 0). The old code divided by that zero and
 *     pinned the bar at 0% for the whole download — indistinguishable from "not
 *     started". We surface `known: false` so the UI can show an *indeterminate*
 *     (animated) bar instead of a frozen 0%.
 *
 *  2. **The install phase.** `downloadAndInstall` keeps working after the last
 *     byte arrives (verifying + swapping the binary). `Finished` marks that
 *     transition, so we report `phase: "installing"` — the user sees "Installing…"
 *     rather than a completed-but-hung "Downloading… 100%".
 *
 * Kept pure and framework-free so it can be unit-tested and so the gateway stays
 * a thin I/O shell over it.
 */

/** Which stage of `downloadAndInstall` the flow is in. */
export type DownloadPhase = "downloading" | "installing"

/** Running byte totals. `total` is 0 when the server didn't advertise a size. */
export interface DownloadProgressState {
  total: number
  received: number
}

/** The serializable progress snapshot handed to the store on each event. */
export interface DownloadProgressUpdate {
  phase: DownloadPhase
  /** 0..1. Meaningful only when `known` is true; 0 while indeterminate. */
  fraction: number
  /** Whether `total` is known, i.e. whether `fraction` is a real percentage. */
  known: boolean
}

/** The subset of Tauri's `DownloadEvent` this reducer consumes. */
export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" }

/** A fresh, pre-download progress state. */
export const initialDownloadProgress: DownloadProgressState = {
  total: 0,
  received: 0,
}

/**
 * Fold one download event into the running state, returning both the next state
 * (to thread into the following event) and the update to surface to the UI.
 */
export function reduceDownloadEvent(
  state: DownloadProgressState,
  event: DownloadEvent
): { state: DownloadProgressState; update: DownloadProgressUpdate } {
  switch (event.event) {
    case "Started": {
      const total = event.data.contentLength ?? 0
      return {
        state: { total, received: 0 },
        update: { phase: "downloading", fraction: 0, known: total > 0 },
      }
    }
    case "Progress": {
      const received = state.received + event.data.chunkLength
      const next = { total: state.total, received }
      const known = state.total > 0
      return {
        state: next,
        update: {
          phase: "downloading",
          fraction: known ? Math.min(received / state.total, 1) : 0,
          known,
        },
      }
    }
    case "Finished":
      return {
        state,
        update: { phase: "installing", fraction: 1, known: true },
      }
  }
}

/** Clamp a 0..1 fraction to an integer percentage for display. */
export function toPercent(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100)
}
