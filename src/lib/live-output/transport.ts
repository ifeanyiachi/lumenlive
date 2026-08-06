/**
 * Pure transport-display helpers for the operator monitors: clock formatting,
 * reconciling the local element state with the position echoed back from the
 * broadcast output, and live-edge detection.
 */

/** Format seconds as `m:ss`, treating non-finite/negative input as 0. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, "0")}`
}

export interface MediaTransport {
  position: number
  duration: number
  playing: boolean
}

export interface MediaDisplay {
  duration: number
  current: number
  playing: boolean
}

/**
 * Resolve what the transport bar should show. The output position echoed back
 * from the broadcast window wins for duration (falling back with `||`) and
 * playing (falling back with `??`); the local position is shown while the user
 * is actively dragging the scrubber, otherwise the echoed position is preferred.
 */
export function resolveMediaDisplay(params: {
  transport: MediaTransport | null | undefined
  dragging: boolean
  localCurrent: number
  localDuration: number
  localPlaying: boolean
}): MediaDisplay {
  const { transport, dragging, localCurrent, localDuration, localPlaying } =
    params
  return {
    duration: transport?.duration || localDuration,
    current: dragging ? localCurrent : (transport?.position ?? localCurrent),
    playing: transport?.playing ?? localPlaying,
  }
}

/** Whether a live stream is effectively at its live edge (within `tolerance`s). */
export function isAtLiveEdge(
  isLive: boolean,
  duration: number,
  position: number,
  tolerance = 5
): boolean {
  return isLive && duration > 0 && position >= duration - tolerance
}
