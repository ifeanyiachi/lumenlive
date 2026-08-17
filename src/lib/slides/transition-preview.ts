import type { SlideTransitionType } from "@/types/slide"

/**
 * Composite the *previous* slide over the already-drawn current slide for a
 * transition preview, at a given progress `t` in [0, 1].
 *
 * The caller is expected to have already painted the current (incoming) slide
 * onto `ctx`; this overlays `prevCanvas` (the outgoing slide, pre-rendered to an
 * offscreen canvas) using the effect for `type`:
 *   - fade / dissolve — fade the previous frame out (alpha `1 - t`);
 *   - push-left / push-right — slide the previous frame off-screen;
 *   - wipe-left / wipe-right — clip a shrinking band of the previous frame.
 *
 * Extracted verbatim from the editor's inline transition loop so the compositing
 * math is unit-testable for parity. Pure canvas 2D — no React/store access.
 */
export function drawTransitionOverlay(
  ctx: CanvasRenderingContext2D,
  prevCanvas: CanvasImageSource,
  type: SlideTransitionType,
  progress: number,
  width: number,
  height: number
): void {
  switch (type) {
    case "fade":
    case "dissolve":
      ctx.save()
      ctx.globalAlpha = 1 - progress
      ctx.drawImage(prevCanvas, 0, 0, width, height)
      ctx.restore()
      break
    case "push-left":
      ctx.drawImage(prevCanvas, -(width * progress), 0, width, height)
      break
    case "push-right":
      ctx.drawImage(prevCanvas, width * progress, 0, width, height)
      break
    case "wipe-left": {
      const wipeX = width * (1 - progress)
      ctx.save()
      ctx.beginPath()
      ctx.rect(wipeX, 0, width - wipeX, height)
      ctx.clip()
      ctx.drawImage(prevCanvas, 0, 0, width, height)
      ctx.restore()
      break
    }
    case "wipe-right": {
      const wipeW = width * (1 - progress)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, wipeW, height)
      ctx.clip()
      ctx.drawImage(prevCanvas, 0, 0, width, height)
      ctx.restore()
      break
    }
  }
}
