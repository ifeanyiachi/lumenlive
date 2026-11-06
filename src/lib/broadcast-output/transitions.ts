/**
 * Slide-transition snapshot helpers for the output window (S2 Phase 3).
 *
 * A transition cross-fades from a frozen snapshot of the *outgoing* frame to the
 * live incoming frame. Two snapshot modes exist:
 *   - {@link snapshotCanvas} — a full copy of the current program frame, for the
 *     ordinary cross-fade between two different backgrounds.
 *   - {@link snapshotSlideElements} — only the outgoing slide's ELEMENTS on a
 *     transparent canvas, used when the incoming slide shares the same animated
 *     background: the live background keeps running underneath and only the old
 *     text fades out, instead of ghosting two frozen backgrounds.
 *
 * Both operate on a caller-owned persistent `prev` canvas (reused across
 * transitions), so this module holds no state. The actual per-frame compositing
 * of `prev` over the live frame lives in `overlays.drawTransitionFrame`.
 */

import { drawSlideElements } from "@/lib/slide-renderer"
import type { SlideRenderCaches } from "@/lib/slide-renderer"
import type { Slide } from "@/types/slide"

/** Copy the current program frame (`source`) into `prev`, resizing `prev` to match. */
export function snapshotCanvas(
  prev: HTMLCanvasElement,
  source: HTMLCanvasElement
): void {
  prev.width = source.width
  prev.height = source.height
  const pCtx = prev.getContext("2d")
  if (pCtx) pCtx.drawImage(source, 0, 0)
}

/**
 * Snapshot only `slide`'s elements onto `prev` at the given surface size (so the
 * transition blends against a same-sized current frame — no scale/ghost on
 * non-16:9 surfaces). `prev` is cleared first, leaving a transparent backdrop.
 */
export function snapshotSlideElements(
  prev: HTMLCanvasElement,
  slide: Slide,
  width: number,
  height: number,
  caches: SlideRenderCaches
): void {
  prev.width = width
  prev.height = height
  const pCtx = prev.getContext("2d")
  if (!pCtx) return
  pCtx.clearRect(0, 0, width, height)
  drawSlideElements(pCtx, slide, width, height, caches)
}
