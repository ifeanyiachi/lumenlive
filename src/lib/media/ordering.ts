import type { MediaAsset } from "@/types/media"

/**
 * Library display order: most-recently-added first.
 *
 * The media library appends new imports to the end of its `assets` array, so
 * raw insertion order is oldest→newest. Every surface that lists media (the
 * main grid, the quick-add picker) wants the opposite — a freshly uploaded
 * photo or video should land at the top where the operator is looking — so they
 * all sort through this one comparator.
 *
 * `addedAt` ties (a bulk import stamps one `Date.now()` across the batch) fall
 * back to insertion order via the stable sort below, so a batch stays in the
 * order it was picked while still sitting above everything imported earlier.
 */
export function byRecencyDesc(a: MediaAsset, b: MediaAsset): number {
  return b.addedAt - a.addedAt
}

/** Return a new array ordered most-recently-added first (non-mutating). */
export function sortByRecency(assets: MediaAsset[]): MediaAsset[] {
  return [...assets].sort(byRecencyDesc)
}
