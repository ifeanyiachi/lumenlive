import type { Slide } from "@/types/slide"
import { linearGradientCoords } from "@/lib/canvas-draw"
import type { SlideRenderCaches, SlideRenderOptions } from "./types"
import { drawAnimatedBackground } from "./animated-background"

/**
 * Draws a slide's background (solid, gradient, image, video, transparent) plus
 * the brightness/tint overlay applied to image and video backgrounds.
 */

function drawBrightnessAndTint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness?: number,
  tint?: string
): void {
  if (brightness != null && brightness !== 1) {
    ctx.fillStyle =
      brightness < 1
        ? `rgba(0,0,0,${1 - brightness})`
        : `rgba(255,255,255,${brightness - 1})`
    ctx.fillRect(0, 0, width, height)
  }
  if (tint) {
    ctx.fillStyle = tint
    ctx.fillRect(0, 0, width, height)
  }
}

export function drawSlideBackground(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  width: number,
  height: number,
  caches?: SlideRenderCaches,
  opts?: SlideRenderOptions
): void {
  const bg = slide.background

  switch (bg.type) {
    case "solid":
      ctx.fillStyle = bg.color ?? "#000000"
      ctx.fillRect(0, 0, width, height)
      break

    case "gradient": {
      if (!bg.gradient) break
      let grad: CanvasGradient
      if (bg.gradient.type === "linear") {
        grad = ctx.createLinearGradient(
          ...linearGradientCoords(width, height, bg.gradient.angle ?? 180)
        )
      } else {
        grad = ctx.createRadialGradient(
          width / 2,
          height / 2,
          0,
          width / 2,
          height / 2,
          Math.max(width, height) / 2
        )
      }
      for (const stop of bg.gradient.stops) {
        grad.addColorStop(stop.offset, stop.color)
      }
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
      break
    }

    case "image": {
      const url = bg.imageUrl
      if (!url) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      const img = caches?.imageCache?.get(url)
      if (img) {
        ctx.save()
        const blurVal = bg.blur ?? 0
        if (blurVal > 0) {
          ctx.filter = `blur(${blurVal}px)`
          const pad = blurVal * 2
          ctx.drawImage(img, -pad, -pad, width + pad * 2, height + pad * 2)
        } else {
          ctx.drawImage(img, 0, 0, width, height)
        }
        ctx.restore()
        drawBrightnessAndTint(ctx, width, height, bg.brightness, bg.tint)
      } else {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
      }
      break
    }

    case "video": {
      const url = bg.videoUrl
      if (!url) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      const video = caches?.videoCache?.get(url)
      if (video && video.readyState >= 2) {
        const srcW = video.videoWidth
        const srcH = video.videoHeight
        if (srcW && srcH) {
          const scale = Math.max(width / srcW, height / srcH)
          const dw = srcW * scale
          const dh = srcH * scale
          ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh)
        } else {
          ctx.drawImage(video, 0, 0, width, height)
        }
        drawBrightnessAndTint(ctx, width, height, bg.brightness, bg.tint)
      } else {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
      }
      break
    }

    case "animated":
      if (!bg.animated) {
        ctx.fillStyle = "#000000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      drawAnimatedBackground(
        ctx,
        bg.animated,
        width,
        height,
        opts?.frameTime ?? 0
      )
      break

    case "transparent":
      ctx.clearRect(0, 0, width, height)
      break

    default:
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)
  }
}
