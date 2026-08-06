import type {
  Slide,
  SlideElement,
  SlideTextElement,
  SlideImageElement,
  SlideScriptureElement,
  SlideShapeElement,
  SlideVideoElement,
} from "@/types/slide"
import type { SlideRenderCaches, SlideRenderOptions } from "./types"
import { drawSlideBackground } from "./background"
import { drawTextElement, drawScriptureElement } from "./text-drawing"
import {
  buildShapePath,
  drawImageElement,
  drawShapeElement,
  drawVideoElement,
} from "./elements"
import { applyAnimationTransform, applyRotation } from "./transforms"

/**
 * Public entry point for slide rendering. Orchestrates background → elements
 * (honouring visibility, mask-shape clipping, rotation, and animation) by
 * composing the focused sub-modules:
 *
 *   types → text-drawing / background / elements / transforms / predicates → (this facade)
 *
 * The module's public API is re-exported below so existing `@/lib/slide-renderer`
 * imports keep working unchanged.
 */

export type { SlideRenderCaches, SlideRenderOptions } from "./types"
export {
  slideHasVideoBackground,
  slideHasVideo,
  slideHasScrollingText,
  slideHasAnimatedBackground,
  sameAnimatedBackground,
} from "./predicates"
export { getTextLineCount, getTextWordCount } from "./text-drawing"

function drawSingleElement(
  ctx: CanvasRenderingContext2D,
  element: SlideElement,
  canvasWidth: number,
  canvasHeight: number,
  caches?: SlideRenderCaches,
  textBuildProgress?: number
): void {
  const elType = element.type ?? "text"
  switch (elType) {
    case "text":
      drawTextElement(
        ctx,
        element as SlideTextElement,
        canvasWidth,
        canvasHeight,
        textBuildProgress
      )
      break
    case "image":
      drawImageElement(
        ctx,
        element as SlideImageElement,
        canvasWidth,
        canvasHeight,
        caches
      )
      break
    case "scripture":
      drawScriptureElement(
        ctx,
        element as SlideScriptureElement,
        canvasWidth,
        canvasHeight
      )
      break
    case "shape":
      drawShapeElement(
        ctx,
        element as SlideShapeElement,
        canvasWidth,
        canvasHeight
      )
      break
    case "video":
      drawVideoElement(
        ctx,
        element as SlideVideoElement,
        canvasWidth,
        canvasHeight,
        caches
      )
      break
  }
}

function drawSlideElement(
  ctx: CanvasRenderingContext2D,
  element: SlideElement,
  canvasWidth: number,
  canvasHeight: number,
  caches?: SlideRenderCaches,
  opts?: SlideRenderOptions
): void {
  if (element.visible === false) return

  // Skip mask shapes — they are rendered as clip paths on their targets
  if (element.type === "shape" && (element as SlideShapeElement).maskTargetId)
    return

  const animState = opts?.animationStates?.get(element.id)
  if (animState && animState.opacity <= 0) return

  ctx.save()

  const rotated = applyRotation(ctx, element, canvasWidth, canvasHeight)

  if (animState) {
    applyAnimationTransform(ctx, element, canvasWidth, canvasHeight, animState)
  }

  // Check if any shape masks target this element
  const textBuild = opts?.textBuildProgress?.get(element.id)

  drawSingleElement(ctx, element, canvasWidth, canvasHeight, caches, textBuild)

  if (rotated) ctx.restore()
  ctx.restore()
}

/**
 * Draws only a slide's elements (mask-clipped, in order) onto the current
 * context — no background. Split out of {@link renderSlide} so transitions can
 * keep a shared animated background running live while cross-fading just the
 * element/text layers (see the background-persist path in the output surfaces).
 */
export function drawSlideElements(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  width: number,
  height: number,
  caches?: SlideRenderCaches,
  opts?: SlideRenderOptions
): void {
  // Collect mask shapes for lookup
  const maskShapes = new Map<string, SlideShapeElement>()
  for (const el of slide.elements) {
    if (el.type === "shape" && (el as SlideShapeElement).maskTargetId) {
      maskShapes.set(
        (el as SlideShapeElement).maskTargetId!,
        el as SlideShapeElement
      )
    }
  }

  for (const element of slide.elements) {
    if (element.visible === false) continue
    if (element.type === "shape" && (element as SlideShapeElement).maskTargetId)
      continue

    const mask = maskShapes.get(element.id)
    if (mask) {
      ctx.save()
      buildShapePath(ctx, mask, width, height)
      ctx.clip()
      drawSlideElement(ctx, element, width, height, caches, opts)
      ctx.restore()
    } else {
      drawSlideElement(ctx, element, width, height, caches, opts)
    }
  }
}

export function renderSlide(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  width: number,
  height: number,
  imageCache?: Map<string, HTMLImageElement>,
  videoCache?: Map<string, HTMLVideoElement>,
  opts?: SlideRenderOptions
): void {
  const caches: SlideRenderCaches = { imageCache, videoCache }
  drawSlideBackground(ctx, slide, width, height, caches, opts)
  drawSlideElements(ctx, slide, width, height, caches, opts)
}
