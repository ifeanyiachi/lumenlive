import type {
  BroadcastTheme,
  ThemeElement,
  VerseRenderData,
  RenderOptions,
} from "@/types/broadcast"
import {
  renderThemeElementMasked,
  buildThemeShapePath,
  collectMasks,
  type MaskMap,
} from "@/lib/theme-element-renderer"
import { roundRect } from "./text-style"
import { drawBackground } from "./background"
import { drawReference, drawVerseText } from "./verse-text"
import { computeVerseLayoutMetrics, type VerseLayoutMetrics } from "./layout"

/**
 * Public entry point for verse rendering. Orchestrates the pipeline —
 * background → text box → verse/reference regions and custom elements, honouring
 * the theme's layer order — by composing the focused sub-modules:
 *
 *   text-style → verse-tokens / background → verse-text / layout → (this facade)
 *
 * The module's public API (`renderVerse`, `computeVerseLayoutMetrics`,
 * `anchorPosition`, `wrapText`, and the layout types) is re-exported below so
 * existing `@/lib/verse-renderer` imports keep working unchanged.
 */

export { wrapText, wrapTextWithHardBreaks } from "./verse-tokens"
export { anchorPosition, computeVerseLayoutMetrics } from "./layout"
export type { VerseLayoutRect, VerseLayoutMetrics } from "./layout"

export function renderVerse(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics | null {
  try {
    return renderVerseImpl(ctx, theme, verse, options)
  } catch (e) {
    console.error("[verse-renderer] render error:", e)
    return null
  }
}

function drawTextBox(
  ctx: CanvasRenderingContext2D,
  scaledTheme: BroadcastTheme,
  metrics: VerseLayoutMetrics,
  opacity: number
) {
  if (!scaledTheme.textBox.enabled) return
  ctx.save()
  ctx.globalAlpha = opacity * scaledTheme.textBox.opacity
  ctx.fillStyle = scaledTheme.textBox.color
  roundRect(
    ctx,
    metrics.textAreaRect.x,
    metrics.textAreaRect.y,
    metrics.textAreaRect.width,
    metrics.textAreaRect.height,
    scaledTheme.textBox.borderRadius
  )
  ctx.fill()
  ctx.restore()
}

function drawFixedRegion(
  ctx: CanvasRenderingContext2D,
  regionId: string,
  scaledTheme: BroadcastTheme,
  verse: VerseRenderData | null,
  metrics: VerseLayoutMetrics,
  opacity: number,
  masks: MaskMap
) {
  const mask = masks.shapes.get(regionId)
  if (mask) {
    ctx.save()
    buildThemeShapePath(ctx, mask)
    ctx.clip()
  }

  if (regionId === "textArea") {
    drawTextBox(ctx, scaledTheme, metrics, opacity)
  } else if (regionId === "verse" && verse && metrics.verseRect) {
    drawVerseText(
      ctx,
      scaledTheme,
      verse,
      metrics.textRect.x,
      metrics.textRect.width,
      metrics.verseRect.y,
      metrics.wrappedVerse ?? undefined
    )
  } else if (regionId === "reference" && verse && metrics.referenceRect) {
    drawReference(
      ctx,
      scaledTheme,
      verse.reference,
      metrics.textRect.x,
      metrics.textRect.width,
      metrics.referenceRect.y
    )
  }

  if (mask) {
    ctx.restore()
  }
}

const FIXED_IDS = new Set(["textArea", "verse", "reference"])

function renderVerseImpl(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData | null,
  options?: RenderOptions
): VerseLayoutMetrics {
  const metrics = computeVerseLayoutMetrics(ctx, theme, verse, options)
  const scaledTheme = metrics.scaledTheme
  const opacity = options?.opacity ?? 1
  const imageCache = options?.imageCache ?? new Map<string, HTMLImageElement>()

  ctx.save()

  if (opacity !== 1) {
    ctx.globalAlpha = opacity
  }

  drawBackground(ctx, scaledTheme, options?.imageCache)

  const layerOrder = theme.layerOrder
  if (!layerOrder || layerOrder.length === 0) {
    drawTextBox(ctx, scaledTheme, metrics, opacity)
    if (verse) {
      if (metrics.verseRect) {
        drawVerseText(
          ctx,
          scaledTheme,
          verse,
          metrics.textRect.x,
          metrics.textRect.width,
          metrics.verseRect.y,
          metrics.wrappedVerse ?? undefined
        )
      }
      if (metrics.referenceRect) {
        drawReference(
          ctx,
          scaledTheme,
          verse.reference,
          metrics.textRect.x,
          metrics.textRect.width,
          metrics.referenceRect.y
        )
      }
    }
    ctx.restore()
    return metrics
  }

  const elements = theme.elements ?? []
  const elementsMap = new Map(elements.map((e) => [e.id, e]))
  const masks = collectMasks(elements)
  const scale = options?.scale ?? 1

  for (const id of [...layerOrder].reverse()) {
    if (FIXED_IDS.has(id)) {
      drawFixedRegion(ctx, id, scaledTheme, verse, metrics, opacity, masks)
    } else {
      const el = elementsMap.get(id)
      if (!el || !el.visible) continue
      if (scale !== 1) {
        const scaled: ThemeElement = {
          ...el,
          x: el.x * scale,
          y: el.y * scale,
          width: el.width * scale,
          height: el.height * scale,
        }
        renderThemeElementMasked(ctx, scaled, imageCache, masks)
      } else {
        renderThemeElementMasked(ctx, el, imageCache, masks)
      }
    }
  }

  ctx.restore()
  return metrics
}
