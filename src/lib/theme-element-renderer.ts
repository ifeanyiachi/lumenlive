import type { ThemeElement } from "@/types/broadcast"

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawImageFit(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  fit: "cover" | "contain" | "stretch"
) {
  if (fit === "stretch") {
    ctx.drawImage(img, x, y, w, h)
    return
  }
  const imgRatio = img.naturalWidth / img.naturalHeight
  const boxRatio = w / h
  let sx: number, sy: number, sw: number, sh: number
  if (fit === "cover") {
    if (imgRatio > boxRatio) {
      sh = img.naturalHeight
      sw = sh * boxRatio
      sx = (img.naturalWidth - sw) / 2
      sy = 0
    } else {
      sw = img.naturalWidth
      sh = sw / boxRatio
      sx = 0
      sy = (img.naturalHeight - sh) / 2
    }
  } else {
    if (imgRatio > boxRatio) {
      const drawW = w
      const drawH = w / imgRatio
      const drawY = y + (h - drawH) / 2
      ctx.drawImage(img, x, drawY, drawW, drawH)
      return
    } else {
      const drawH = h
      const drawW = h * imgRatio
      const drawX = x + (w - drawW) / 2
      ctx.drawImage(img, drawX, y, drawW, drawH)
      return
    }
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

export function buildThemeShapePath(
  ctx: CanvasRenderingContext2D,
  el: ThemeElement
): void {
  if (!el.shape) return
  ctx.beginPath()
  switch (el.shape.shapeType) {
    case "circle": {
      const rx = el.width / 2
      const ry = el.height / 2
      ctx.ellipse(el.x + rx, el.y + ry, rx, ry, 0, 0, Math.PI * 2)
      break
    }
    case "rounded-rect": {
      const r = Math.min(el.shape.borderRadius, el.width / 2, el.height / 2)
      ctx.roundRect(el.x, el.y, el.width, el.height, r)
      break
    }
    default:
      ctx.rect(el.x, el.y, el.width, el.height)
  }
}

export function renderThemeElement(
  ctx: CanvasRenderingContext2D,
  el: ThemeElement,
  imageCache: Map<string, HTMLImageElement>
) {
  ctx.save()

  if (el.type === "shape" && el.shape) {
    const s = el.shape
    ctx.globalAlpha = s.fillOpacity
    ctx.fillStyle = s.fillColor
    if (s.strokeWidth > 0) {
      ctx.strokeStyle = s.strokeColor
      ctx.lineWidth = s.strokeWidth
    }
    if (s.shapeType === "circle") {
      const rx = el.width / 2
      const ry = el.height / 2
      ctx.beginPath()
      ctx.ellipse(el.x + rx, el.y + ry, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      if (s.strokeWidth > 0) ctx.stroke()
    } else {
      const r = s.shapeType === "rounded-rect" ? s.borderRadius : 0
      if (r > 0) {
        roundRect(ctx, el.x, el.y, el.width, el.height, r)
        ctx.fill()
        if (s.strokeWidth > 0) ctx.stroke()
      } else {
        ctx.fillRect(el.x, el.y, el.width, el.height)
        if (s.strokeWidth > 0) ctx.strokeRect(el.x, el.y, el.width, el.height)
      }
    }
  } else if (el.type === "image" && el.image) {
    const img = el.image.url ? imageCache.get(el.image.url) : null
    ctx.globalAlpha = el.image.opacity
    const r = el.image.borderRadius
    if (r > 0) {
      ctx.beginPath()
      roundRect(ctx, el.x, el.y, el.width, el.height, r)
      ctx.clip()
    }
    if (img) {
      drawImageFit(ctx, img, el.x, el.y, el.width, el.height, el.image.fit)
    } else {
      ctx.fillStyle = "#374151"
      ctx.fillRect(el.x, el.y, el.width, el.height)
      ctx.strokeStyle = "#6b7280"
      ctx.lineWidth = 2
      ctx.setLineDash([8, 4])
      ctx.strokeRect(el.x, el.y, el.width, el.height)
      ctx.setLineDash([])
      ctx.fillStyle = "#9ca3af"
      ctx.font = "24px sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText("No Image", el.x + el.width / 2, el.y + el.height / 2)
    }
  }

  ctx.restore()
}

export interface MaskMap {
  shapes: Map<string, ThemeElement>
}

export function collectMasks(elements: ThemeElement[]): MaskMap {
  const shapes = new Map<string, ThemeElement>()
  for (const el of elements) {
    if (el.type === "shape" && el.maskTargetId) {
      shapes.set(el.maskTargetId, el)
    }
  }
  return { shapes }
}

export function renderThemeElementMasked(
  ctx: CanvasRenderingContext2D,
  el: ThemeElement,
  imageCache: Map<string, HTMLImageElement>,
  masks: MaskMap
) {
  if (el.type === "shape" && el.maskTargetId) return

  const mask = masks.shapes.get(el.id)
  if (mask) {
    ctx.save()
    buildThemeShapePath(ctx, mask)
    ctx.clip()
    renderThemeElement(ctx, el, imageCache)
    ctx.restore()
  } else {
    renderThemeElement(ctx, el, imageCache)
  }
}
