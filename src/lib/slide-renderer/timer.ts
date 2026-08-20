import type { SlideTimerElement } from "@/types/slide"
import {
  formatCountdownTime,
  resolveTargetEpoch,
  resolveTimeColor,
} from "@/lib/countdown/timer"
import { surfaceFontScale } from "@/lib/canvas-constants"

/**
 * Timer-element rendering for slides. A {@link SlideTimerElement} is authored
 * configuration, not a running countdown, so the display is derived purely from
 * its fields plus an optional injected wall-clock `now` (epoch ms) — reusing the
 * `lib/countdown` math so a timer element and the operator/broadcast countdown
 * overlays can never drift.
 *
 * No React/Zustand/Tauri here — pure canvas + math, mirroring the rest of the
 * slide renderer.
 */

/**
 * Seconds remaining for a timer element at `now`.
 *
 * Clock mode counts down to the configured time-of-day (needs `now`); duration
 * mode — and any mode without an injected clock (authoring/preview) — renders the
 * static configured `durationSeconds`. Negative once a clock-mode target passes.
 */
export function computeTimerRemaining(
  element: SlideTimerElement,
  now?: number
): number {
  if (element.mode === "clock" && element.targetTime && now != null) {
    const target = resolveTargetEpoch(element.targetTime, now)
    if (target != null) return (target - now) / 1000
  }
  return element.durationSeconds
}

/** The formatted time string + urgency color a timer element should paint. */
export function computeTimerDisplay(
  element: SlideTimerElement,
  now?: number
): { text: string; color: string } {
  const remaining = computeTimerRemaining(element, now)
  return {
    text: formatCountdownTime(remaining, element.format, element.overtime ?? false),
    color: resolveTimeColor(remaining, {
      textColor: element.color,
      warnSeconds: element.warnSeconds,
      dangerSeconds: element.dangerSeconds,
    }),
  }
}

/** Line-height multiple used to vertically place the single time line. */
const TIMER_LINE_HEIGHT = 1.2

/**
 * Paint a timer element's current time onto the context. Single-line, aligned
 * within the element box, honouring warn/danger recolor, optional background
 * fill, and shadow.
 */
export function drawTimerElement(
  ctx: CanvasRenderingContext2D,
  element: SlideTimerElement,
  canvasWidth: number,
  canvasHeight: number,
  now?: number
): void {
  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  const { text, color } = computeTimerDisplay(element, now)

  ctx.save()

  if (element.backgroundColor) {
    ctx.fillStyle = element.backgroundColor
    ctx.fillRect(x, y, w, h)
  }

  const fontScale = surfaceFontScale(canvasWidth, canvasHeight)
  const fontSize = element.fontSize * fontScale
  const style = element.italic ? "italic " : ""
  ctx.font = `${style}${element.fontWeight} ${fontSize}px ${element.fontFamily}, sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = "top"
  ctx.textAlign = element.horizontalAlign

  const lineH = fontSize * TIMER_LINE_HEIGHT

  let textX: number
  switch (element.horizontalAlign) {
    case "center":
      textX = x + w / 2
      break
    case "right":
      textX = x + w
      break
    default:
      textX = x
  }

  let textY: number
  switch (element.verticalAlign) {
    case "middle":
      textY = y + (h - lineH) / 2
      break
    case "bottom":
      textY = y + h - lineH
      break
    default:
      textY = y
  }

  if (element.shadow) {
    ctx.shadowColor = element.shadow.color
    ctx.shadowOffsetX = element.shadow.offsetX
    ctx.shadowOffsetY = element.shadow.offsetY
    ctx.shadowBlur = element.shadow.blur
  }

  ctx.fillText(text, textX, textY)

  ctx.restore()
}
