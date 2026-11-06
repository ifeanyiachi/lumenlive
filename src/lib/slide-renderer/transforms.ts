import type { SlideElement } from "@/types/slide"
import type { ElementAnimationState } from "@/lib/slide-animation"

/**
 * Canvas transform helpers applied around an element before it is painted:
 * static rotation and per-frame animation (opacity, translate, scale).
 */

/**
 * Apply an element's static rotation about its centre. Returns `true` when a
 * rotation was applied (and therefore a matching `ctx.restore()` is owed).
 */
export function applyRotation(
  ctx: CanvasRenderingContext2D,
  element: SlideElement,
  canvasWidth: number,
  canvasHeight: number
): boolean {
  const rotation = element.rotation
  if (!rotation) return false
  const cx = ((element.x + element.width / 2) / 100) * canvasWidth
  const cy = ((element.y + element.height / 2) / 100) * canvasHeight
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.translate(-cx, -cy)
  return true
}

/** Apply an element's animation state (opacity, translate, scale) to the context. */
export function applyAnimationTransform(
  ctx: CanvasRenderingContext2D,
  element: SlideElement,
  canvasWidth: number,
  canvasHeight: number,
  animState: ElementAnimationState
): void {
  ctx.globalAlpha *= animState.opacity

  const px = ((element.x + element.width / 2) / 100) * canvasWidth
  const py = ((element.y + element.height / 2) / 100) * canvasHeight
  const tx = (animState.translateX / 100) * canvasWidth
  const ty = (animState.translateY / 100) * canvasHeight

  if (tx !== 0 || ty !== 0) {
    ctx.translate(tx, ty)
  }

  if (animState.scale !== 1) {
    ctx.translate(px, py)
    ctx.scale(animState.scale, animState.scale)
    ctx.translate(-px, -py)
  }
}
