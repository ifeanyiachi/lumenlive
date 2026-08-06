/**
 * Pure marker-navigation helpers shared by the media and web transport monitors.
 * Both monitors sort their markers by time and jump to the next/previous marker
 * relative to the current position (falling back to a ±step seek when a clip has
 * no markers). Extracted here so that logic lives in one tested place instead of
 * being duplicated inside two components.
 */

/** Return a time-sorted copy of the markers (original array left untouched). */
export function sortMarkers<T extends { time: number }>(
  markers: readonly T[]
): T[] {
  return markers.slice().sort((a, b) => a.time - b.time)
}

/**
 * Find the marker just after (`dir === 1`) or just before (`dir === -1`) the
 * given position, using the same 0.25s guard band the monitors use to skip the
 * marker you're sitting on. Returns `undefined` when there is none in that
 * direction. Markers are assumed already time-sorted.
 */
export function findMarkerInDirection<T extends { time: number }>(
  markers: readonly T[],
  position: number,
  dir: 1 | -1
): T | undefined {
  return dir === 1
    ? markers.find((m) => m.time > position + 0.25)
    : [...markers].reverse().find((m) => m.time < position - 0.25)
}

/** Seek target for the no-markers fallback: ±`step` seconds, clamped at 0. */
export function relativeSeekTarget(
  position: number,
  dir: 1 | -1,
  step = 5
): number {
  return Math.max(0, position + dir * step)
}
