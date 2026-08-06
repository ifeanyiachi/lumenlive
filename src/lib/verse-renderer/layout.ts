import type {
  BroadcastTheme,
  VerseRenderData,
  RenderOptions,
} from "@/types/broadcast"
import { applyTextTransform } from "@/lib/canvas-draw"
import {
  alignX,
  alignY,
  resolveHorizontalAlign,
  resolveTextTransform,
  resolveVerticalAlign,
} from "./text-style"
import {
  buildRenderTokens,
  hasAnySpans,
  wrapStyledText,
  wrapTextMeasured,
  type WrappedVerseContent,
} from "./verse-tokens"

/**
 * Layout computation for verse rendering: anchor positioning, theme scaling, and
 * the measured rects for the text area, verse, and reference. This is a
 * measurement pass (no pixels drawn) that `renderVerse` consumes to place each
 * region. The returned {@link VerseLayoutMetrics} is also part of the module's
 * public API (used by design-canvas / theme-canvas-overlay).
 */

export interface VerseLayoutRect {
  x: number
  y: number
  width: number
  height: number
}

export interface VerseLayoutMetrics {
  scaledTheme: BroadcastTheme
  textAreaRect: VerseLayoutRect
  textRect: VerseLayoutRect
  referenceRect: VerseLayoutRect | null
  verseRect: VerseLayoutRect | null
  /**
   * The verse body wrapped during this measurement pass. `renderVerse` hands it
   * to `drawVerseText` so the text is wrapped once per render rather than twice.
   * `null` when there is no verse.
   */
  wrappedVerse: WrappedVerseContent | null
}

export function anchorPosition(
  anchor: BroadcastTheme["layout"]["anchor"],
  areaWidth: number,
  areaHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  offsetX: number,
  offsetY: number
): { x: number; y: number } {
  let x: number
  let y: number

  switch (anchor) {
    case "top-left":
      x = 0
      y = 0
      break
    case "top-center":
      x = (canvasWidth - areaWidth) / 2
      y = 0
      break
    case "top-right":
      x = canvasWidth - areaWidth
      y = 0
      break
    case "center":
      x = (canvasWidth - areaWidth) / 2
      y = (canvasHeight - areaHeight) / 2
      break
    case "bottom-left":
      x = 0
      y = canvasHeight - areaHeight
      break
    case "bottom-center":
      x = (canvasWidth - areaWidth) / 2
      y = canvasHeight - areaHeight
      break
    case "bottom-right":
      x = canvasWidth - areaWidth
      y = canvasHeight - areaHeight
      break
  }

  return { x: x + offsetX, y: y + offsetY }
}

function buildScaledTheme(
  theme: BroadcastTheme,
  scale: number
): BroadcastTheme {
  // Fast path: the broadcast output renders at scale 1 every frame, so skip the
  // full deep-clone-and-multiply (pure garbage churn in the RAF hot path).
  if (scale === 1) return theme
  const layout = {
    ...theme.layout,
    offsetX: theme.layout.offsetX * scale,
    offsetY: theme.layout.offsetY * scale,
    padding: {
      top: theme.layout.padding.top * scale,
      right: theme.layout.padding.right * scale,
      bottom: theme.layout.padding.bottom * scale,
      left: theme.layout.padding.left * scale,
    },
  }
  return {
    ...theme,
    layout,
    resolution: {
      width: theme.resolution.width * scale,
      height: theme.resolution.height * scale,
    },
    verseText: {
      ...theme.verseText,
      fontSize: theme.verseText.fontSize * scale,
      letterSpacing: theme.verseText.letterSpacing * scale,
      shadow: theme.verseText.shadow
        ? {
            ...theme.verseText.shadow,
            blur: theme.verseText.shadow.blur * scale,
            x: theme.verseText.shadow.x * scale,
            y: theme.verseText.shadow.y * scale,
          }
        : null,
      outline: theme.verseText.outline
        ? {
            ...theme.verseText.outline,
            width: theme.verseText.outline.width * scale,
          }
        : null,
    },
    verseNumbers: {
      ...theme.verseNumbers,
      fontSize: theme.verseNumbers.fontSize * scale,
    },
    reference: {
      ...theme.reference,
      fontSize: theme.reference.fontSize * scale,
      letterSpacing: theme.reference.letterSpacing * scale,
      shadow: theme.reference.shadow
        ? {
            ...theme.reference.shadow,
            blur: theme.reference.shadow.blur * scale,
            x: theme.reference.shadow.x * scale,
            y: theme.reference.shadow.y * scale,
          }
        : null,
      outline: theme.reference.outline
        ? {
            ...theme.reference.outline,
            width: theme.reference.outline.width * scale,
          }
        : null,
    },
    textBox: {
      ...theme.textBox,
      borderRadius: theme.textBox.borderRadius * scale,
      padding: theme.textBox.padding * scale,
    },
  }
}

function measureVerseHeight(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  textRectWidth: number
): { height: number; maxLineWidth: number; wrapped: WrappedVerseContent } {
  const vt = theme.verseText
  const vn = theme.verseNumbers
  const verseAlign = resolveHorizontalAlign(
    vt.horizontalAlign,
    theme.layout.textAlign,
    true
  )
  const lineHeightPx = vt.fontSize * vt.lineHeight
  ctx.save()
  ctx.font = `${vt.fontWeight} ${vt.fontSize}px "${vt.fontFamily}", serif`
  if (vt.letterSpacing > 0) {
    try {
      ctx.letterSpacing = `${vt.letterSpacing}px`
    } catch {
      /* unsupported in some WebViews */
    }
  }

  const isInterlinear = verse.segments.some((s) => s.isInterlinear)
  const isStyled = !isInterlinear && hasAnySpans(verse.segments)

  if (isStyled) {
    const tokens = buildRenderTokens(verse.segments, theme)
    const styledLines = wrapStyledText(ctx, tokens, textRectWidth, theme)
    let maxLineWidth = 0
    for (const line of styledLines) {
      if (line.totalWidth > maxLineWidth) maxLineWidth = line.totalWidth
    }
    ctx.restore()
    return {
      height: Math.max(lineHeightPx, styledLines.length * lineHeightPx),
      maxLineWidth: Math.max(1, maxLineWidth),
      wrapped: { kind: "styled", lines: styledLines },
    }
  }

  let fullText = ""
  for (const segment of verse.segments) {
    if (vn.visible && segment.verseNumber !== undefined)
      fullText += `${segment.verseNumber} `
    fullText += `${segment.text} `
  }
  const transformed = applyTextTransform(
    fullText.trim(),
    resolveTextTransform(vt.textTransform)
  )
  const lines = wrapTextMeasured(ctx, transformed, textRectWidth)
  let maxLineWidth = 0
  for (const [index, line] of lines.entries()) {
    const isJustifiedLine =
      verseAlign === "justify" &&
      index < lines.length - 1 &&
      /\s+/.test(line.text)
    const width = isJustifiedLine ? textRectWidth : line.width
    if (width > maxLineWidth) maxLineWidth = width
  }
  ctx.restore()
  return {
    height: Math.max(lineHeightPx, lines.length * lineHeightPx),
    maxLineWidth: Math.max(1, maxLineWidth),
    wrapped: { kind: "plain", lines },
  }
}

function rectForAlignedText(
  align: BroadcastTheme["layout"]["textAlign"],
  drawX: number,
  drawY: number,
  width: number,
  height: number,
  textRect: VerseLayoutRect
): VerseLayoutRect {
  let x = drawX
  if (align === "center") x = drawX - width / 2
  if (align === "right") x = drawX - width
  const clampedX = Math.max(
    textRect.x,
    Math.min(x, textRect.x + textRect.width - width)
  )
  const clampedY = Math.max(textRect.y, drawY)
  return {
    x: clampedX,
    y: clampedY,
    width: Math.min(width, textRect.width),
    height: Math.min(height, textRect.height),
  }
}

// ── Layout memoisation ──────────────────────────────────────────────────────
// `computeVerseLayoutMetrics` is the measurement hot path: `renderVerse` calls it
// every animation frame while video/animations play, yet the result only changes
// when the verse, theme, scale, or offsets change. Cache the last few results per
// verse object so repeated frames are a pure lookup with zero `measureText`. The
// cache is keyed by object identity (verse + theme) plus the scalar options, so
// it relies on the app's immutable-update model — a mutated-in-place theme would
// not invalidate, exactly as React's own change detection assumes.

interface LayoutCacheEntry {
  theme: BroadcastTheme
  scale: number
  offsetX: number
  offsetY: number
  fontEpoch: number
  metrics: VerseLayoutMetrics
}

const layoutCache = new WeakMap<VerseRenderData, LayoutCacheEntry[]>()
/** Same verse can be laid out at a few scales at once (broadcast + panels). */
const MAX_ENTRIES_PER_VERSE = 6

// `measureText` widths change once web fonts finish loading; bump an epoch then
// so any layout measured with fallback metrics is recomputed rather than served
// stale forever. Guarded for non-DOM environments (tests, workers).
let fontEpoch = 0
if (
  typeof document !== "undefined" &&
  document.fonts &&
  "addEventListener" in document.fonts
) {
  document.fonts.addEventListener("loadingdone", () => {
    fontEpoch++
  })
}

/** Test-only: drop all memoised layouts so cases don't leak state into others. */
export function __clearLayoutCacheForTests(): void {
  // WeakMap has no clear(); a fresh epoch invalidates every existing entry.
  fontEpoch++
}

export function computeVerseLayoutMetrics(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics {
  const scale = options?.scale ?? 1
  const optOffsetX = options?.offsetX ?? 0
  const optOffsetY = options?.offsetY ?? 0

  if (verse) {
    const entries = layoutCache.get(verse)
    if (entries) {
      for (const e of entries) {
        if (
          e.theme === theme &&
          e.scale === scale &&
          e.offsetX === optOffsetX &&
          e.offsetY === optOffsetY &&
          e.fontEpoch === fontEpoch
        ) {
          return e.metrics
        }
      }
    }
  }

  const metrics = computeVerseLayoutMetricsUncached(ctx, theme, verse, options)

  if (verse) {
    let entries = layoutCache.get(verse)
    if (!entries) {
      entries = []
      layoutCache.set(verse, entries)
    }
    entries.push({
      theme,
      scale,
      offsetX: optOffsetX,
      offsetY: optOffsetY,
      fontEpoch,
      metrics,
    })
    if (entries.length > MAX_ENTRIES_PER_VERSE) entries.shift()
  }

  return metrics
}

function computeVerseLayoutMetricsUncached(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics {
  const scale = options?.scale ?? 1
  const scaledTheme = buildScaledTheme(theme, scale)
  const canvasW = scaledTheme.resolution.width
  const canvasH = scaledTheme.resolution.height
  const layout = scaledTheme.layout

  const bgW = (layout.backgroundWidth / 100) * canvasW
  const bgH = (layout.backgroundHeight / 100) * canvasH
  const textAreaW = (layout.textAreaWidth / 100) * bgW
  const textAreaH = (layout.textAreaHeight / 100) * bgH
  const globalOffsetX = (options?.offsetX ?? 0) + layout.offsetX
  const globalOffsetY = (options?.offsetY ?? 0) + layout.offsetY
  const pos = anchorPosition(
    layout.anchor,
    textAreaW,
    textAreaH,
    canvasW,
    canvasH,
    globalOffsetX,
    globalOffsetY
  )

  const pad = layout.padding
  const textRectX = pos.x + pad.left
  const textRectY = pos.y + pad.top
  const textRectW = textAreaW - pad.left - pad.right
  const textRectH = textAreaH - pad.top - pad.bottom
  const textAreaRect: VerseLayoutRect = {
    x: pos.x,
    y: pos.y,
    width: textAreaW,
    height: textAreaH,
  }
  const textRect: VerseLayoutRect = {
    x: textRectX,
    y: textRectY,
    width: textRectW,
    height: textRectH,
  }

  if (!verse) {
    return {
      scaledTheme,
      textAreaRect,
      textRect,
      referenceRect: null,
      verseRect: null,
      wrappedVerse: null,
    }
  }

  const refLineHeight = scaledTheme.reference.lineHeight ?? 1.4
  const referenceHeight = scaledTheme.reference.fontSize * refLineHeight
  const verseAlign = resolveHorizontalAlign(
    scaledTheme.verseText.horizontalAlign,
    scaledTheme.layout.textAlign,
    true
  )
  const referenceAlign = resolveHorizontalAlign(
    scaledTheme.reference.horizontalAlign,
    scaledTheme.layout.textAlign,
    false
  )
  const blockVerticalAlign = resolveVerticalAlign(
    scaledTheme.reference.position === "above"
      ? (scaledTheme.reference.verticalAlign ??
          scaledTheme.verseText.verticalAlign)
      : (scaledTheme.verseText.verticalAlign ??
          scaledTheme.reference.verticalAlign)
  )
  const referenceGap = Math.max(
    0,
    scaledTheme.layout.referenceGap ?? scaledTheme.reference.fontSize * 0.5
  )
  const verseMetrics = measureVerseHeight(ctx, scaledTheme, verse, textRectW)
  const verseHeight = verseMetrics.height
  const verseDrawX = alignX(
    verseAlign === "justify" ? "left" : verseAlign,
    textRectX,
    textRectW
  )
  const referenceDrawX = alignX(
    referenceAlign === "justify" ? "left" : referenceAlign,
    textRectX,
    textRectW
  )

  const refText = applyTextTransform(
    scaledTheme.reference.uppercase
      ? verse.reference.toUpperCase()
      : verse.reference,
    resolveTextTransform(scaledTheme.reference.textTransform)
  )
  ctx.save()
  const refItalic2 =
    scaledTheme.reference.fontStyle === "italic" ? "italic " : ""
  ctx.font = `${refItalic2}${scaledTheme.reference.fontWeight} ${scaledTheme.reference.fontSize}px "${scaledTheme.reference.fontFamily}", sans-serif`
  const referenceWidth = Math.max(
    1,
    Math.min(textRectW, ctx.measureText(refText).width)
  )
  ctx.restore()

  const blockHeight =
    scaledTheme.reference.position === "above"
      ? referenceHeight + verseHeight
      : scaledTheme.reference.position === "below"
        ? verseHeight + referenceGap + referenceHeight
        : verseHeight + referenceHeight
  const blockStartY = alignY(
    blockVerticalAlign,
    textRectY,
    textRectH,
    blockHeight
  )

  let referenceRect: VerseLayoutRect
  let verseRect: VerseLayoutRect
  if (scaledTheme.reference.position === "above") {
    const refY = blockStartY
    const verseY = blockStartY + referenceHeight
    referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      referenceDrawX,
      refY,
      referenceWidth,
      referenceHeight,
      textRect
    )
    verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      verseDrawX,
      verseY,
      verseMetrics.maxLineWidth,
      verseHeight,
      textRect
    )
  } else if (scaledTheme.reference.position === "below") {
    const verseY = blockStartY
    const refY = blockStartY + verseHeight + referenceGap
    verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      verseDrawX,
      verseY,
      verseMetrics.maxLineWidth,
      verseHeight,
      textRect
    )
    referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      referenceDrawX,
      refY,
      referenceWidth,
      referenceHeight,
      textRect
    )
  } else {
    const verseY = blockStartY
    const refY = blockStartY + verseHeight
    verseRect = rectForAlignedText(
      verseAlign === "justify" ? "left" : verseAlign,
      verseDrawX,
      verseY,
      verseMetrics.maxLineWidth,
      verseHeight,
      textRect
    )
    referenceRect = rectForAlignedText(
      referenceAlign === "justify" ? "left" : referenceAlign,
      referenceDrawX,
      refY,
      referenceWidth,
      referenceHeight,
      textRect
    )
  }

  return {
    scaledTheme,
    textAreaRect,
    textRect,
    referenceRect,
    verseRect,
    wrappedVerse: verseMetrics.wrapped,
  }
}
