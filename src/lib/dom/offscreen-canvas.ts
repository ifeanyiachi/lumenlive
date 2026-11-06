/**
 * Persistent offscreen-canvas reuse.
 *
 * Allocating a fresh `document.createElement("canvas")` (or reassigning an
 * identical `width`/`height`, which reallocates the backing buffer) on every
 * call is a hot-path foot-gun: transition previews and per-slide text measuring
 * ran it repeatedly, churning 1920×1080 buffers through the GC. This helper
 * holds a single canvas in a caller-owned ref and only resizes it when the
 * requested dimensions actually change, mirroring the reuse pattern in
 * `design-canvas.tsx`.
 */

/** A minimal ref-like holder so this stays pure (no React dependency). */
export interface CanvasHolder {
  current: HTMLCanvasElement | null
}

/**
 * Return the holder's canvas sized to `width`×`height`, creating it on first
 * use. Assigning `width`/`height` already clears the canvas, so a manual clear
 * is only issued when the dimensions were unchanged and `clear` is set (the
 * default) — giving callers the same blank surface a fresh canvas would.
 */
export function acquireOffscreenCanvas(
  holder: CanvasHolder,
  width: number,
  height: number,
  clear = true
): HTMLCanvasElement {
  const canvas =
    holder.current ?? (holder.current = document.createElement("canvas"))
  const resized = canvas.width !== width || canvas.height !== height
  if (canvas.width !== width) canvas.width = width
  if (canvas.height !== height) canvas.height = height
  if (!resized && clear) {
    canvas.getContext("2d")?.clearRect(0, 0, width, height)
  }
  return canvas
}
