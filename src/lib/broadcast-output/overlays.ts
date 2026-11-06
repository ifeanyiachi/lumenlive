import type {
  ActiveAlert,
  AlertTemplate,
  ActiveCountdown,
  CountdownTimer,
} from "@/types/alert"
import type { BroadcastProp } from "@/types/broadcast"
import type { SlideTransitionType } from "@/types/slide"
import type { Theme } from "@/types/theme"
import {
  computeRemainingSeconds,
  computeProgressRemaining,
  formatCountdownTime,
  resolveTimeColor,
} from "@/lib/countdown/timer"
import { renderSlide } from "@/lib/slide-renderer"
import {
  buildCountdownSlide,
  pruneCountdownSlideCache,
} from "./countdown-slide"
import { surfaceFontScale } from "@/lib/canvas-constants"

// Re-exported for back-compat: the countdown time math now lives in the shared
// pure module so the operator preview and this painter can never disagree.
export { formatCountdownTime }

/**
 * Pure canvas painters for the broadcast output's overlay layer — alerts,
 * countdown timers, props — and the slide-transition compositor. Each takes its
 * data explicitly (the component reads it from refs and passes it in) plus an
 * injected `now` where a clock is needed, so the drawing is deterministic and
 * testable in isolation from the window's event/RAF wiring.
 */

/**
 * Geometry of an alert bar as fractions of the output, independent of pixel
 * size. Shared by the audience canvas painter ({@link drawAlertOverlay}) and the
 * operator's DOM preview mirror so the two stay in lockstep — change the bar's
 * proportions here and both surfaces move together.
 */
export interface AlertBarLayout {
  /** Bar height as a fraction of output height (0–1). */
  heightFrac: number
  /** Anchored to the top edge (else the bottom). Irrelevant when fullscreen. */
  top: boolean
  fullscreen: boolean
}

/** Compute an alert template's bar layout: fullscreen, lower-third, or banner. */
export function alertBarLayout(template: AlertTemplate): AlertBarLayout {
  const fullscreen = template.style === "fullscreen"
  const isLowerThird = template.style === "lower-third"
  return {
    heightFrac: fullscreen ? 1 : isLowerThird ? 1 / 3 : 0.08,
    top: template.position === "top",
    fullscreen,
  }
}

/** Draw the active alert bars (fullscreen / lower-third / bar), newest last. */
export function drawAlertOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alerts: { alert: ActiveAlert; template: AlertTemplate }[]
): void {
  if (alerts.length === 0) return

  for (const { alert, template } of alerts) {
    const { heightFrac, top, fullscreen } = alertBarLayout(template)
    const barH = fullscreen ? h : Math.round(h * heightFrac)
    const barY = fullscreen ? 0 : top ? 0 : h - barH

    ctx.fillStyle = template.backgroundColor
    ctx.fillRect(0, barY, w, barH)

    ctx.fillStyle = template.textColor
    ctx.font = `600 ${template.fontSize * surfaceFontScale(w, h)}px Inter, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(alert.message, w / 2, barY + barH / 2, w - 80)
  }
}

/** Draw the active countdown timers. `now` is the current epoch ms (injected). */
export function drawCountdownOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  countdowns: {
    countdown: ActiveCountdown
    timer: CountdownTimer
    theme?: Theme
  }[],
  now: number
): void {
  if (countdowns.length === 0) return

  // Free cached themed slides for timers no longer on screen (flip F3 / D6).
  pruneCountdownSlideCache(
    countdowns.filter((c) => c.theme).map((c) => c.timer.id)
  )

  for (const { countdown, timer, theme } of countdowns) {
    const remaining = computeRemainingSeconds(countdown, now)
    const overtime = timer.endAction === "overtime"
    const timeStr = formatCountdownTime(remaining, timer.format, overtime)

    // Themed countdown (flip F3): render the presented slide (background,
    // decorations, heading, timer digits) through the slide renderer. The timer
    // element derives the digit string + urgency colour from `lib/countdown`, so
    // the look matches the retired `renderCountdownTheme` path (4d parity gate).
    // Flash pulses the whole frame's opacity on expiry via `globalAlpha`.
    if (theme) {
      const slide = buildCountdownSlide(timer, theme, countdown, now)
      const flashing = remaining <= 0 && timer.endAction === "flash"
      const prevAlpha = ctx.globalAlpha
      if (flashing) ctx.globalAlpha = prevAlpha * Math.abs(Math.sin(now / 300))
      renderSlide(ctx, slide, w, h, undefined, undefined, { now })
      ctx.globalAlpha = prevAlpha
      continue
    }

    const timeColor = resolveTimeColor(remaining, timer)

    if (timer.position === "fullscreen") {
      drawFullscreenCountdown(ctx, w, h, countdown, timer, {
        now,
        remaining,
        timeStr,
        timeColor,
      })
      continue
    }

    const fontSize = timer.fontSize * surfaceFontScale(w, h)
    const labelSize = fontSize * 0.4

    ctx.font = `700 ${fontSize}px ${timer.fontFamily}, sans-serif`
    const timeMetrics = ctx.measureText(timeStr)
    const textH = fontSize
    const labelH = timer.showLabel ? labelSize * 1.4 : 0
    const totalH = textH + labelH
    const padX = fontSize * 0.6
    const padY = fontSize * 0.3
    const boxW = timeMetrics.width + padX * 2
    const boxH = totalH + padY * 2

    let bx: number, by: number
    switch (timer.position) {
      case "top-left":
        bx = 40
        by = 40
        break
      case "top-center":
        bx = (w - boxW) / 2
        by = 40
        break
      case "top-right":
        bx = w - boxW - 40
        by = 40
        break
      case "bottom-left":
        bx = 40
        by = h - boxH - 40
        break
      case "bottom-center":
        bx = (w - boxW) / 2
        by = h - boxH - 40
        break
      case "bottom-right":
        bx = w - boxW - 40
        by = h - boxH - 40
        break
      default:
        bx = (w - boxW) / 2
        by = (h - boxH) / 2
        break
    }

    ctx.save()

    if (remaining <= 0 && timer.endAction === "flash") {
      ctx.globalAlpha = Math.abs(Math.sin(now / 300))
    }

    ctx.fillStyle = timer.backgroundColor
    ctx.beginPath()
    ctx.roundRect(bx, by, boxW, boxH, 12 * surfaceFontScale(w, h))
    ctx.fill()

    if (timer.showLabel && timer.label) {
      ctx.font = `500 ${labelSize}px ${timer.fontFamily}, sans-serif`
      ctx.fillStyle = timer.textColor
      ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.7
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.fillText(timer.label, bx + boxW / 2, by + padY)
      ctx.globalAlpha = ctx.globalAlpha / 0.7
    }

    ctx.font = `700 ${fontSize}px ${timer.fontFamily}, sans-serif`
    ctx.fillStyle = timeColor
    ctx.textAlign = "center"
    ctx.textBaseline = "top"
    ctx.fillText(timeStr, bx + boxW / 2, by + padY + labelH)

    ctx.restore()
  }
}

/**
 * Full-screen "starting soon" layout: the background color fills the frame, a
 * progress ring wraps a large centered timer, and the label sits above it. The
 * time text auto-shrinks so wide formats (hh:mm:ss) still fit inside the ring.
 */
function drawFullscreenCountdown(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  countdown: ActiveCountdown,
  timer: CountdownTimer,
  frame: {
    now: number
    remaining: number
    timeStr: string
    timeColor: string
  }
): void {
  const { now, remaining, timeStr, timeColor } = frame

  ctx.save()

  if (remaining <= 0 && timer.endAction === "flash") {
    ctx.globalAlpha = Math.abs(Math.sin(now / 300))
  }

  // Scrim across the whole output.
  ctx.fillStyle = timer.backgroundColor
  ctx.fillRect(0, 0, w, h)

  const cx = w / 2
  const cy = h / 2
  const radius = Math.min(w, h) * 0.32
  const ringWidth = radius * 0.06
  const progress = computeProgressRemaining(countdown, now)

  // Track (faint) then the remaining-time arc, sweeping clockwise from 12o'clock.
  ctx.lineWidth = ringWidth
  ctx.lineCap = "round"
  ctx.strokeStyle = "rgba(255,255,255,0.15)"
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.stroke()

  if (progress > 0) {
    const start = -Math.PI / 2
    ctx.strokeStyle = timeColor
    ctx.beginPath()
    ctx.arc(cx, cy, radius, start, start + Math.PI * 2 * progress)
    ctx.stroke()
  }

  // Time text, shrunk to fit comfortably within the ring.
  let timeFont = radius * 0.55
  ctx.font = `700 ${timeFont}px ${timer.fontFamily}, sans-serif`
  const maxTextW = radius * 1.5
  const measured = ctx.measureText(timeStr).width
  if (measured > maxTextW) {
    timeFont *= maxTextW / measured
    ctx.font = `700 ${timeFont}px ${timer.fontFamily}, sans-serif`
  }
  ctx.fillStyle = timeColor
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(timeStr, cx, cy)

  // Label above the ring.
  if (timer.showLabel && timer.label) {
    const labelFont = radius * 0.16
    ctx.font = `500 ${labelFont}px ${timer.fontFamily}, sans-serif`
    ctx.fillStyle = timer.textColor
    ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.75
    ctx.textAlign = "center"
    ctx.textBaseline = "bottom"
    ctx.fillText(timer.label, cx, cy - radius - ringWidth - labelFont * 0.6)
  }

  ctx.restore()
}

/**
 * Draw the active props (text boxes / cached images / scrolling marquees) over
 * the frame. `now` is the current epoch ms (injected) and only affects marquee
 * props — text and image output is independent of it.
 */
export function drawPropsOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  props: BroadcastProp[],
  imageCache: Map<string, HTMLImageElement>,
  now = 0
): void {
  if (props.length === 0) return

  for (const prop of props) {
    const px = (prop.x / 100) * w
    const py = (prop.y / 100) * h
    const pw = (prop.width / 100) * w
    const ph = (prop.height / 100) * h

    ctx.save()
    ctx.globalAlpha = prop.opacity ?? 1

    if (prop.type === "text") {
      if (prop.backgroundColor) {
        ctx.fillStyle = prop.backgroundColor
        ctx.fillRect(px, py, pw, ph)
      }
      const fontSize = (prop.fontSize ?? 32) * surfaceFontScale(w, h)
      ctx.font = `${prop.fontWeight ?? 600} ${fontSize}px ${prop.fontFamily ?? "Inter"}, sans-serif`
      ctx.fillStyle = prop.color ?? "#ffffff"
      ctx.textBaseline = "middle"
      const pad = 8
      const align = prop.textAlign ?? "center"
      ctx.textAlign = align
      const tx =
        align === "left"
          ? px + pad
          : align === "right"
            ? px + pw - pad
            : px + pw / 2
      ctx.fillText(prop.text ?? "", tx, py + ph / 2, pw - pad * 2)
    } else if (prop.type === "marquee") {
      drawMarquee(ctx, prop, px, py, pw, ph, w, h, now)
    } else if (prop.type === "image" && prop.imageUrl) {
      const img = imageCache.get(prop.imageUrl)
      if (img) {
        ctx.drawImage(img, px, py, pw, ph)
      }
    }

    ctx.restore()
  }
}

/**
 * Paint one scrolling-text prop. The line is clipped to the prop box and drawn
 * as repeated copies spaced one `period` (text width + gap) apart, so as one
 * copy exits the far edge the next has already entered — a seamless loop. The
 * horizontal offset is derived purely from `now`, so the same clock yields the
 * same frame (deterministic and testable). `canvasW` is the full output width,
 * used to scale the authored speed (px/sec @1920) to the current resolution.
 */
function drawMarquee(
  ctx: CanvasRenderingContext2D,
  prop: BroadcastProp,
  px: number,
  py: number,
  pw: number,
  ph: number,
  canvasW: number,
  canvasH: number,
  now: number
): void {
  if (prop.backgroundColor) {
    ctx.fillStyle = prop.backgroundColor
    ctx.fillRect(px, py, pw, ph)
  }

  const text = prop.text ?? ""
  if (text.length === 0) return

  const surfaceScale = surfaceFontScale(canvasW, canvasH)
  const fontSize = (prop.fontSize ?? 32) * surfaceScale
  ctx.font = `${prop.fontWeight ?? 600} ${fontSize}px ${prop.fontFamily ?? "Inter"}, sans-serif`
  ctx.fillStyle = prop.color ?? "#ffffff"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"

  // Clip so copies scrolling in/out are cut cleanly at the box edges.
  ctx.beginPath()
  ctx.rect(px, py, pw, ph)
  ctx.clip()

  const textW = ctx.measureText(text).width
  // A gap of one em keeps consecutive copies from touching.
  const gap = fontSize
  const period = textW + gap

  const speed = (prop.scrollSpeed ?? 120) * surfaceScale
  // "left" (default): text enters from the right and exits left. "right": inverse.
  const travelled = (now / 1000) * speed // px scrolled since epoch
  const raw = prop.scrollDirection === "right" ? -travelled : travelled
  // phase ∈ [0, period): how far the tiling has slid within one repeat.
  const phase = ((raw % period) + period) % period

  const midY = py + ph / 2
  // Tile copies one period apart; start one period left of the box so the seam
  // entering from the left is always covered.
  const startX = px - phase - period
  for (let x = startX; x < px + pw; x += period) {
    ctx.fillText(text, x, midY)
  }
}

/**
 * Composite the previous-frame snapshot over the freshly-drawn frame for a slide
 * transition at `progress` (0→1). No-op when there is no snapshot.
 */
export function drawTransitionFrame(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  progress: number,
  type: SlideTransitionType,
  prev: HTMLCanvasElement | null
): void {
  if (!prev) return

  switch (type) {
    case "fade":
    case "dissolve": {
      ctx.save()
      ctx.globalAlpha = 1 - progress
      ctx.drawImage(prev, 0, 0, w, h)
      ctx.restore()
      break
    }
    case "push-left": {
      const offset = w * progress
      ctx.save()
      ctx.drawImage(prev, -offset, 0, w, h)
      ctx.restore()
      break
    }
    case "push-right": {
      const offset = w * progress
      ctx.save()
      ctx.drawImage(prev, offset, 0, w, h)
      ctx.restore()
      break
    }
    case "wipe-left": {
      const wipeX = w * (1 - progress)
      ctx.save()
      ctx.beginPath()
      ctx.rect(wipeX, 0, w - wipeX, h)
      ctx.clip()
      ctx.drawImage(prev, 0, 0, w, h)
      ctx.restore()
      break
    }
    case "wipe-right": {
      const wipeW = w * (1 - progress)
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, wipeW, h)
      ctx.clip()
      ctx.drawImage(prev, 0, 0, w, h)
      ctx.restore()
      break
    }
  }
}
