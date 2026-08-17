/**
 * Layer-list drag hit-testing.
 *
 * The presentation editor's layer reorder used to read every row's live
 * `getBoundingClientRect()` on every `pointermove` — a forced synchronous
 * reflow per event (P2 layout thrash). The rows don't reflow during a drag
 * (only cosmetic highlight classes change), so their rects can be snapshotted
 * once at `pointerdown` and hit-tested against here. This module is the pure
 * half: capture the rects, then map a pointer Y to a row index.
 */

export interface LayerRowRect {
  /** The row's `data-layer-idx` (index into the reversed, top-down list). */
  idx: number
  top: number
  bottom: number
}

/**
 * Snapshot the vertical bounds of every `[data-layer-idx]` row inside `list`.
 * Called once at drag-start so the per-move path never touches layout.
 */
export function captureLayerRowRects(list: HTMLElement): LayerRowRect[] {
  const rows = list.querySelectorAll<HTMLElement>("[data-layer-idx]")
  const rects: LayerRowRect[] = []
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    rects.push({
      idx: Number(row.dataset.layerIdx),
      top: rect.top,
      bottom: rect.bottom,
    })
  }
  return rects
}

/**
 * Return the layer index whose row contains pointer `y`, or `null` if none.
 * Uses the same half-open `[top, bottom)` interval and first-match ordering as
 * the original live DOM scan, so a cached-rect hit-test is byte-identical to
 * reading the rects per move.
 */
export function pickLayerIndexAtY(
  rects: readonly LayerRowRect[],
  y: number
): number | null {
  for (const r of rects) {
    if (y >= r.top && y < r.bottom) return r.idx
  }
  return null
}
