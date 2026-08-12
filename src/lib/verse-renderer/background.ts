import type { BroadcastTheme } from "@/types/broadcast"
import { fitBackgroundRect, linearGradientCoords } from "@/lib/canvas-draw"
import { drawAnimatedBackground } from "@/lib/slide-renderer/animated-background"

/**
 * Draws a theme's background layer (solid, gradient, image, video, animated, or
 * transparent) onto the full canvas. Isolated from text/layout concerns so the
 * background pipeline can evolve independently.
 *
 * `frameTime` (ms) is the clock for an animated background — the animated engine
 * is a pure function of it, so callers own the clock (a RAF loop for the live
 * output/designer preview; a fixed value in tests). Ignored for other types.
 */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  imageCache?: Map<string, HTMLImageElement>,
  frameTime = 0
): void {
  const { width, height } = theme.resolution
  const bg = theme.background

  switch (bg.type) {
    case "solid":
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, width, height)
      break

    case "gradient": {
      if (!bg.gradient) break
      let grad: CanvasGradient

      if (bg.gradient.type === "linear") {
        grad = ctx.createLinearGradient(
          ...linearGradientCoords(width, height, bg.gradient.angle)
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
        grad.addColorStop(stop.position / 100, stop.color)
      }

      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)
      break
    }

    case "image": {
      if (!bg.image) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      const img = imageCache?.get(bg.image.url)
      if (!img) {
        // Use a deterministic fallback while image is still loading.
        ctx.fillStyle = bg.image.tint ?? "#000"
        ctx.fillRect(0, 0, width, height)
        break
      }

      ctx.save()

      if (bg.image.blur > 0) {
        ctx.filter = `blur(${bg.image.blur}px) brightness(${bg.image.brightness / 100})`
      } else if (bg.image.brightness !== 100) {
        ctx.filter = `brightness(${bg.image.brightness / 100})`
      }

      const imgRect = fitBackgroundRect(
        img.naturalWidth,
        img.naturalHeight,
        width,
        height,
        bg.image.fit
      )
      ctx.drawImage(img, imgRect.x, imgRect.y, imgRect.w, imgRect.h)
      ctx.restore()

      if (bg.image.tint) {
        ctx.fillStyle = bg.image.tint
        ctx.fillRect(0, 0, width, height)
      }
      break
    }

    case "video": {
      if (!bg.video || !bg.video.url) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      const vid = imageCache?.get(`video:${bg.video.url}`) as unknown as
        HTMLVideoElement | undefined
      if (!vid) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      ctx.save()
      if (bg.video.brightness !== 100) {
        ctx.filter = `brightness(${bg.video.brightness / 100})`
      }
      const vidRect = fitBackgroundRect(
        vid.videoWidth,
        vid.videoHeight,
        width,
        height,
        bg.video.fit
      )
      ctx.drawImage(vid, vidRect.x, vidRect.y, vidRect.w, vidRect.h)
      ctx.restore()
      break
    }

    case "animated":
      if (!bg.animated) {
        ctx.fillStyle = "#000"
        ctx.fillRect(0, 0, width, height)
        break
      }
      drawAnimatedBackground(ctx, bg.animated, width, height, frameTime)
      break

    case "transparent":
      ctx.clearRect(0, 0, width, height)
      break
  }
}
