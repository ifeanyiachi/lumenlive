import type { VerseStyle } from "@/types/broadcast"

/**
 * Leaf text-style helpers for verse rendering: alignment math, theme-value
 * resolution with fallbacks, and small canvas primitives (rounded rects, decoration
 * lines). These sit at the bottom of the verse-renderer dependency graph — no
 * dependencies on other verse-renderer modules — so everything else can build on them.
 */

export function alignX(
  textAlign: "left" | "center" | "right",
  rectX: number,
  rectWidth: number
): number {
  switch (textAlign) {
    case "left":
      return rectX
    case "center":
      return rectX + rectWidth / 2
    case "right":
      return rectX + rectWidth
  }
}

export function alignY(
  verticalAlign: "top" | "middle" | "bottom",
  rectY: number,
  rectHeight: number,
  contentHeight: number
): number {
  switch (verticalAlign) {
    case "middle":
      return rectY + (rectHeight - contentHeight) / 2
    case "bottom":
      return rectY + rectHeight - contentHeight
    case "top":
    default:
      return rectY
  }
}

export function resolveHorizontalAlign(
  value:
    | VerseStyle["verseText"]["horizontalAlign"]
    | VerseStyle["reference"]["horizontalAlign"]
    | undefined,
  fallback: VerseStyle["layout"]["textAlign"],
  allowJustify: boolean
): "left" | "center" | "right" | "justify" {
  if (!value) return fallback
  if (value === "justify" && !allowJustify) return fallback
  return value
}

export function resolveVerticalAlign(
  value:
    | VerseStyle["verseText"]["verticalAlign"]
    | VerseStyle["reference"]["verticalAlign"]
    | undefined
): "top" | "middle" | "bottom" {
  return value ?? "top"
}

export function resolveTextTransform(
  value:
    | VerseStyle["verseText"]["textTransform"]
    | VerseStyle["reference"]["textTransform"]
    | undefined
): "none" | "uppercase" | "lowercase" | "capitalize" {
  return value ?? "none"
}

export function resolveTextDecoration(
  value:
    | VerseStyle["verseText"]["textDecoration"]
    | VerseStyle["reference"]["textDecoration"]
    | undefined
): "none" | "underline" | "line-through" {
  return value ?? "none"
}

export function drawTextDecorationLine(
  ctx: CanvasRenderingContext2D,
  decoration: "none" | "underline" | "line-through",
  color: string,
  align: "left" | "center" | "right" | "justify",
  x: number,
  y: number,
  width: number,
  fontSize: number,
  fallbackLeftX?: number
): void {
  if (decoration === "none" || width <= 0) return
  const startX =
    align === "left"
      ? x
      : align === "center"
        ? x - width / 2
        : align === "right"
          ? x - width
          : (fallbackLeftX ?? x)
  const lineY =
    decoration === "underline" ? y + fontSize * 0.92 : y + fontSize * 0.52
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, fontSize * 0.06)
  ctx.beginPath()
  ctx.moveTo(startX, lineY)
  ctx.lineTo(startX + width, lineY)
  ctx.stroke()
  ctx.restore()
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.arcTo(x + width, y, x + width, y + radius, radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius)
  ctx.lineTo(x + radius, y + height)
  ctx.arcTo(x, y + height, x, y + height - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
