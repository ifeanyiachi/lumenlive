import type {
  SlideImageElement,
  SlideShapeElement,
  SlideVideoElement,
} from "@/types/slide"
import { DESIGN_WIDTH } from "@/lib/canvas-constants"
import type { SlideRenderCaches } from "./types"

/**
 * Painters for the non-text slide elements — image, video, and shape — plus the
 * shared shape-path builder used both to fill shapes and to clip mask targets.
 */

export function drawImageElement(
  ctx: CanvasRenderingContext2D,
  element: SlideImageElement,
  canvasWidth: number,
  canvasHeight: number,
  caches?: SlideRenderCaches
): void {
  if (!element.imageUrl) return

  const img = caches?.imageCache?.get(element.imageUrl)
  if (!img) return

  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  ctx.save()
  ctx.globalAlpha = element.opacity

  if (element.borderRadius > 0) {
    const r = element.borderRadius * (canvasWidth / DESIGN_WIDTH)
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.clip()
  }

  switch (element.objectFit) {
    case "fill":
      ctx.drawImage(img, x, y, w, h)
      break
    case "contain":
    case "cover": {
      // Guard against a decode-broken image (naturalHeight 0) or a zero-height
      // box, which would make the ratios NaN/Infinity and paint nothing.
      if (!img.naturalWidth || !img.naturalHeight || w <= 0 || h <= 0) {
        ctx.drawImage(img, x, y, w, h)
        break
      }
      const imgRatio = img.naturalWidth / img.naturalHeight
      const boxRatio = w / h
      let drawW: number, drawH: number
      if (
        element.objectFit === "contain"
          ? imgRatio > boxRatio
          : imgRatio < boxRatio
      ) {
        drawW = w
        drawH = w / imgRatio
      } else {
        drawH = h
        drawW = h * imgRatio
      }
      const drawX = x + (w - drawW) / 2
      const drawY = y + (h - drawH) / 2
      ctx.drawImage(img, drawX, drawY, drawW, drawH)
      break
    }
  }

  ctx.restore()
}

export function buildShapePath(
  ctx: CanvasRenderingContext2D,
  element: SlideShapeElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  ctx.beginPath()
  switch (element.shapeType) {
    case "circle": {
      const rx = w / 2
      const ry = h / 2
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2)
      break
    }
    case "rounded-rect": {
      const r = element.borderRadius * (canvasWidth / DESIGN_WIDTH)
      ctx.roundRect(x, y, w, h, r)
      break
    }
    default:
      ctx.rect(x, y, w, h)
  }
}

export function drawShapeElement(
  ctx: CanvasRenderingContext2D,
  element: SlideShapeElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  ctx.save()
  ctx.globalAlpha = element.opacity

  if (element.shadow) {
    ctx.shadowColor = element.shadow.color
    ctx.shadowOffsetX = element.shadow.offsetX
    ctx.shadowOffsetY = element.shadow.offsetY
    ctx.shadowBlur = element.shadow.blur
  }

  ctx.beginPath()
  switch (element.shapeType) {
    case "circle": {
      const rx = w / 2
      const ry = h / 2
      ctx.ellipse(x + rx, y + ry, rx, ry, 0, 0, Math.PI * 2)
      break
    }
    case "rounded-rect": {
      const r = element.borderRadius * (canvasWidth / DESIGN_WIDTH)
      ctx.roundRect(x, y, w, h, r)
      break
    }
    default:
      ctx.rect(x, y, w, h)
  }

  if (element.fillColor) {
    ctx.fillStyle = element.fillColor
    ctx.fill()
  }

  ctx.shadowColor = "transparent"
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
  ctx.shadowBlur = 0

  if (element.strokeWidth > 0 && element.strokeColor) {
    ctx.strokeStyle = element.strokeColor
    ctx.lineWidth = element.strokeWidth * (canvasWidth / DESIGN_WIDTH)
    ctx.stroke()
  }

  ctx.restore()
}

export function drawVideoElement(
  ctx: CanvasRenderingContext2D,
  element: SlideVideoElement,
  canvasWidth: number,
  canvasHeight: number,
  caches?: SlideRenderCaches
): void {
  if (!element.videoUrl) return

  const video = caches?.videoCache?.get(element.videoUrl)
  if (!video || video.readyState < 2) return

  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  ctx.save()
  ctx.globalAlpha = element.opacity

  if (element.borderRadius > 0) {
    const r = element.borderRadius * (canvasWidth / DESIGN_WIDTH)
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.clip()
  }

  const srcW = video.videoWidth
  const srcH = video.videoHeight

  switch (element.objectFit) {
    case "fill":
      ctx.drawImage(video, x, y, w, h)
      break
    case "contain":
    case "cover": {
      if (srcW && srcH) {
        const imgRatio = srcW / srcH
        const boxRatio = w / h
        let drawW: number, drawH: number
        if (
          element.objectFit === "contain"
            ? imgRatio > boxRatio
            : imgRatio < boxRatio
        ) {
          drawW = w
          drawH = w / imgRatio
        } else {
          drawH = h
          drawW = h * imgRatio
        }
        ctx.drawImage(
          video,
          x + (w - drawW) / 2,
          y + (h - drawH) / 2,
          drawW,
          drawH
        )
      } else {
        ctx.drawImage(video, x, y, w, h)
      }
      break
    }
  }

  ctx.restore()
}
