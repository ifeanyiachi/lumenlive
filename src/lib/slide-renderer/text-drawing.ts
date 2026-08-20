import type { SlideTextElement, SlideScriptureElement } from "@/types/slide"
import {
  computeVerseLayoutMetrics,
  drawReference,
  drawVerseText,
  wrapText,
  wrapTextWithHardBreaks,
} from "@/lib/verse-renderer"
import { applyTextTransform } from "@/lib/canvas-draw"
import { surfaceFontScale } from "@/lib/canvas-constants"
import type { RenderOptions } from "@/types/broadcast"
import type { ScriptureRenderPayload } from "./types"
import { scriptureElementToVerseStyle } from "./scripture-style"

/**
 * Text rendering for slides: font strings, line drawing (with alignment,
 * highlight, outline, shadow, underline, and build-in reveal), auto-shrink, and
 * the text/scripture element painters. Also exposes text-measurement helpers
 * (`getTextLineCount`, `getTextWordCount`) used by callers.
 */

function buildFontString(
  fontSize: number,
  fontWeight: number,
  fontFamily: string,
  italic: boolean
): string {
  const style = italic ? "italic " : ""
  return `${style}${fontWeight} ${fontSize}px ${fontFamily}, sans-serif`
}

function drawUnderline(
  ctx: CanvasRenderingContext2D,
  text: string,
  textX: number,
  lineY: number,
  fontSize: number,
  hAlign: CanvasTextAlign
): void {
  const metrics = ctx.measureText(text)
  const underY = lineY + fontSize * 0.85
  const thickness = Math.max(1, fontSize / 20)

  let startX: number
  switch (hAlign) {
    case "center":
      startX = textX - metrics.width / 2
      break
    case "right":
      startX = textX - metrics.width
      break
    default:
      startX = textX
  }

  ctx.save()
  ctx.strokeStyle = ctx.fillStyle as string
  ctx.lineWidth = thickness
  ctx.beginPath()
  ctx.moveTo(startX, underY)
  ctx.lineTo(startX + metrics.width, underY)
  ctx.stroke()
  ctx.restore()
}

function drawTextLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  element: {
    fontSize: number
    fontWeight: number
    fontFamily: string
    italic: boolean
    underline?: boolean
    color: string
    lineHeight: number
    horizontalAlign: "left" | "center" | "right"
    verticalAlign: "top" | "middle" | "bottom"
    shadow?: { offsetX: number; offsetY: number; blur: number; color: string }
    outline?: { width: number; color: string }
    backgroundColor?: string
    letterSpacing?: number
    textBuild?: { reveal?: "cut" | "fade-up" | "blur-in" }
  },
  x: number,
  y: number,
  w: number,
  h: number,
  fontScale: number,
  textBuildProgress?: number
): void {
  const fontSize = element.fontSize * fontScale
  ctx.font = buildFontString(
    fontSize,
    element.fontWeight,
    element.fontFamily,
    element.italic
  )
  ctx.fillStyle = element.color

  const ls = element.letterSpacing ?? 0
  if (ls !== 0) {
    try {
      ctx.letterSpacing = `${ls}px`
    } catch {
      /* unsupported */
    }
  }
  ctx.textBaseline = "top"

  const hAlign = element.horizontalAlign
  ctx.textAlign = hAlign

  const lineH = fontSize * element.lineHeight
  const totalTextHeight = lines.length * lineH

  let startY: number
  switch (element.verticalAlign) {
    case "middle":
      startY = y + (h - totalTextHeight) / 2
      break
    case "bottom":
      startY = y + h - totalTextHeight
      break
    default:
      startY = y
  }

  let textX: number
  switch (hAlign) {
    case "center":
      textX = x + w / 2
      break
    case "right":
      textX = x + w
      break
    default:
      textX = x
  }

  const visibleLines =
    textBuildProgress != null ? Math.ceil(textBuildProgress) : lines.length

  // Reveal style: "cut" (default) keeps the original char-slice typewriter;
  // "fade-up"/"blur-in" render whole lines and ramp opacity + rise/defocus by
  // each line's own fractional progress.
  const reveal = element.textBuild?.reveal ?? "cut"
  const smooth = reveal === "fade-up" || reveal === "blur-in"

  for (let i = 0; i < Math.min(lines.length, visibleLines); i++) {
    const lineY = startY + i * lineH

    let lineText = lines[i]
    // Per-line progress: below-current lines are 1 (fully in); the current line
    // ramps 0→1; used by the smooth reveals.
    const lineProgress =
      textBuildProgress != null
        ? Math.min(Math.max(textBuildProgress - i, 0), 1)
        : 1

    if (
      !smooth &&
      textBuildProgress != null &&
      i === Math.floor(textBuildProgress) &&
      textBuildProgress % 1 !== 0
    ) {
      const frac = textBuildProgress - Math.floor(textBuildProgress)
      const chars = Math.ceil(lineText.length * frac)
      lineText = lineText.slice(0, chars)
    }

    // Eased opacity + optional rise/blur for the smooth reveals.
    const eased = smooth ? easeOutCubic(lineProgress) : 1
    const drawY =
      smooth && reveal === "fade-up"
        ? lineY + (1 - eased) * lineH * 0.45
        : lineY
    const layered = smooth && (eased < 1 || reveal === "blur-in")
    if (layered) {
      ctx.save()
      ctx.globalAlpha = ctx.globalAlpha * eased
      if (reveal === "blur-in") {
        const blurPx = (1 - lineProgress) * fontSize * 0.18
        if (blurPx > 0.01) ctx.filter = `blur(${blurPx}px)`
      }
    }

    if (element.backgroundColor && lineText.trim()) {
      const metrics = ctx.measureText(lineText)
      const pad = fontSize * 0.15
      let hlX: number
      switch (hAlign) {
        case "center":
          hlX = textX - metrics.width / 2 - pad
          break
        case "right":
          hlX = textX - metrics.width - pad
          break
        default:
          hlX = textX - pad
      }
      ctx.save()
      ctx.fillStyle = element.backgroundColor
      ctx.fillRect(hlX, drawY - pad, metrics.width + pad * 2, lineH + pad * 0.5)
      ctx.restore()
    }

    if (element.outline && element.outline.width > 0) {
      ctx.strokeStyle = element.outline.color
      ctx.lineWidth = element.outline.width * 2
      ctx.lineJoin = "round"
      ctx.strokeText(lineText, textX, drawY)
    }

    if (element.shadow) {
      ctx.shadowColor = element.shadow.color
      ctx.shadowOffsetX = element.shadow.offsetX
      ctx.shadowOffsetY = element.shadow.offsetY
      ctx.shadowBlur = element.shadow.blur
    }

    ctx.fillText(lineText, textX, drawY)

    ctx.shadowColor = "transparent"
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.shadowBlur = 0

    if (element.underline) {
      drawUnderline(ctx, lineText, textX, drawY, fontSize, hAlign)
    }

    if (layered) ctx.restore()
  }
}

/** Standard ease-out cubic for smooth text reveals. */
function easeOutCubic(t: number): number {
  const c = 1 - t
  return 1 - c * c * c
}

const AUTO_SHRINK_MIN_FS = 8

// Memoise shrink results across frames: on a video-background slide this runs
// every rAF tick with identical inputs. Keyed by everything that affects the
// wrapped-line count and the fit test. Capped to bound memory.
const shrinkCache = new Map<string, number>()
const SHRINK_CACHE_MAX = 512

/**
 * Largest font size (stepping down by 2 from `baseFontSize`, floor `AUTO_SHRINK_MIN_FS`)
 * whose wrapped text fits within `boxHeight`. Returns byte-identical results to the
 * old linear `fs -= 2` scan — fitting is monotonic in font size (smaller font wraps
 * to ≤ lines), so a binary search over the same candidate sizes finds the same
 * answer in ~log₂(n) measurements instead of n.
 */
function autoShrinkFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  baseFontSize: number,
  fontWeight: number,
  fontFamily: string,
  italic: boolean,
  lineHeight: number,
  boxWidth: number,
  boxHeight: number
): number {
  const minFs = AUTO_SHRINK_MIN_FS
  const cacheKey = `${baseFontSize}|${fontWeight}|${italic ? 1 : 0}|${lineHeight}|${boxWidth}|${boxHeight}|${fontFamily}|${text}`
  const cached = shrinkCache.get(cacheKey)
  if (cached !== undefined) return cached

  const fits = (fs: number): boolean => {
    ctx.font = buildFontString(fs, fontWeight, fontFamily, italic)
    const lines = wrapTextWithHardBreaks(ctx, text, boxWidth)
    return lines.length * fs * lineHeight <= boxHeight
  }

  let result = minFs
  if (baseFontSize > minFs) {
    // Candidate sizes fs_k = baseFontSize - 2k, for k in [0, maxK], all > minFs —
    // exactly the values the old loop tested. Find the smallest k that fits.
    const maxK = Math.ceil((baseFontSize - minFs) / 2) - 1
    let lo = 0
    let hi = maxK
    let ans = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (fits(baseFontSize - 2 * mid)) {
        ans = mid
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }
    if (ans !== -1) result = baseFontSize - 2 * ans
  }

  if (shrinkCache.size >= SHRINK_CACHE_MAX) shrinkCache.clear()
  shrinkCache.set(cacheKey, result)
  return result
}

/** Test-only surface: the shrink helper and a cache reset. */
export const __textDrawingTesting = {
  autoShrinkFontSize,
  clearShrinkCache: () => shrinkCache.clear(),
}

export function drawTextElement(
  ctx: CanvasRenderingContext2D,
  element: SlideTextElement,
  canvasWidth: number,
  canvasHeight: number,
  textBuildProgress?: number
): void {
  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  let rawText = applyTextTransform(element.text, element.textTransform)

  const listType = element.listType ?? "none"
  let listPrefixes: string[] | null = null
  if (listType !== "none") {
    const rawLines = rawText.split("\n")
    listPrefixes = rawLines.map((_, i) =>
      listType === "bullet" ? "• " : `${i + 1}. `
    )
    rawText = rawLines
      .map((line, i) => (listPrefixes![i] ?? "") + line)
      .join("\n")
  }

  const fontScale = surfaceFontScale(canvasWidth, canvasHeight)
  let fontSize = element.fontSize * fontScale

  ctx.save()

  // Scrolling text: clip to element bounds and offset by scroll amount
  const scrolling = element.scrolling
  if (scrolling) {
    ctx.beginPath()
    ctx.rect(x, y, w, h)
    ctx.clip()
  }

  ctx.font = buildFontString(
    fontSize,
    element.fontWeight,
    element.fontFamily,
    element.italic
  )
  let lines = wrapTextWithHardBreaks(ctx, rawText, w)

  if (!scrolling) {
    const totalH = lines.length * fontSize * element.lineHeight
    if (totalH > h && lines.length > 1) {
      fontSize = autoShrinkFontSize(
        ctx,
        rawText,
        fontSize,
        element.fontWeight,
        element.fontFamily,
        element.italic,
        element.lineHeight,
        w,
        h
      )
      ctx.font = buildFontString(
        fontSize,
        element.fontWeight,
        element.fontFamily,
        element.italic
      )
      lines = wrapTextWithHardBreaks(ctx, rawText, w)
    }
  }

  // Auto-shrink stores the *authored* (unscaled) size back on the element so
  // drawTextLines — which re-applies fontScale — reproduces the shrunk pixels.
  const shrunkElement =
    fontSize !== element.fontSize * fontScale
      ? { ...element, fontSize: fontSize / fontScale }
      : element

  if (scrolling) {
    const lineH = fontSize * element.lineHeight
    const totalContentH = lines.length * lineH
    const speed = scrolling.speed * fontScale
    const now = performance.now() / 1000
    const range = totalContentH + h
    const scrollOffset = (now * speed) % range
    const dy =
      scrolling.direction === "up"
        ? h - scrollOffset
        : -totalContentH + scrollOffset

    ctx.save()
    ctx.translate(0, dy)
    drawTextLines(
      ctx,
      lines,
      shrunkElement,
      x,
      y,
      w,
      totalContentH,
      fontScale,
      textBuildProgress
    )
    ctx.restore()
  } else {
    drawTextLines(
      ctx,
      lines,
      shrunkElement,
      x,
      y,
      w,
      h,
      fontScale,
      textBuildProgress
    )
  }

  ctx.restore()
}

/**
 * Draw a live verse payload for a scripture placeholder by delegating to the
 * verse-renderer's own layout + draw passes (themeredo.md, Phase 4b → 4c).
 *
 * Rather than reimplementing verse geometry, this runs the identical measurement
 * pass `renderVerse` uses — {@link computeVerseLayoutMetrics} — and draws the verse
 * body and reference at the *same* rects, mirroring `renderVerseImpl`'s fixed-region
 * pass. The surface is the draw canvas itself, so the theme projects onto the true
 * output resolution (surface font-scaling) and, when `payload.options.verseAutoFit`
 * is set, the verse font grows/shrinks to fill the box exactly as it does live.
 * Result: verse numbers, styled spans, interlinear, reference format/uppercase,
 * auto-fit, and surface scaling all reproduce `renderVerse` **byte-for-byte** — the
 * placeholder element's own box/typography is intentionally not consulted for the
 * payload path (the theme layout is authoritative, as it is on the verse path).
 */
function drawScriptureVersePayload(
  ctx: CanvasRenderingContext2D,
  payload: ScriptureRenderPayload,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { verse, style } = payload
  // Surface is always the draw canvas — a payload authored once renders correctly
  // at any output resolution — so any `surface` in `payload.options` is ignored.
  const options: RenderOptions = {
    ...payload.options,
    surface: { width: canvasWidth, height: canvasHeight },
  }

  const metrics = computeVerseLayoutMetrics(ctx, style, verse, options)
  const scaledTheme = metrics.scaledTheme

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

// Authoring/preview scripture rendering (themeredo.md) — when there is no live
// `scriptureContent` payload, the placeholder's OWN sample content is rendered
// through the exact same verse-renderer path as live, so every style field (case,
// line height, reference position/uppercase, verse numbers, text box) previews as
// it will output. Memoised per element identity (the store mints a new element on
// every edit, so the cache self-invalidates) to avoid rebuilding the style/verse
// payload each frame.
const authoringPayloadCache = new WeakMap<
  SlideScriptureElement,
  ScriptureRenderPayload
>()

function authoringScripturePayload(
  el: SlideScriptureElement
): ScriptureRenderPayload {
  const cached = authoringPayloadCache.get(el)
  if (cached) return cached
  // Parse a trailing verse number out of the reference (e.g. "John 3:16" → 16) so
  // the verse-number marker has something to show when enabled.
  const refVerse = /:(\d+)\s*$/.exec(el.reference)?.[1]
  const payload: ScriptureRenderPayload = {
    verse: {
      reference: el.reference,
      segments: el.verseText
        ? [
            {
              text: el.verseText,
              verseNumber: refVerse ? Number(refVerse) : undefined,
            },
          ]
        : [],
    },
    style: scriptureElementToVerseStyle(el),
  }
  authoringPayloadCache.set(el, payload)
  return payload
}

export function drawScriptureElement(
  ctx: CanvasRenderingContext2D,
  element: SlideScriptureElement,
  canvasWidth: number,
  canvasHeight: number,
  payload?: ScriptureRenderPayload
): void {
  const x = (element.x / 100) * canvasWidth
  const y = (element.y / 100) * canvasHeight
  const w = (element.width / 100) * canvasWidth
  const h = (element.height / 100) * canvasHeight

  ctx.save()

  if (element.backgroundColor) {
    ctx.fillStyle = element.backgroundColor
    ctx.fillRect(x, y, w, h)
  }

  // Live-verse path (themeredo.md, Phase 4b → 4c — decision D2): when a render-time
  // payload is present, draw the pushed verse through the verse-renderer's own
  // layout + draw passes so the output is byte-identical to `renderVerse` — verse
  // numbers, styled spans, interlinear, reference format/uppercase/transform, AND
  // (Phase 4c) surface font-scaling + auto-fit, since the layout runs against the
  // draw surface. The theme layout is authoritative for geometry (as on the verse
  // path); the stored element's box/typography is not consulted for this path.
  if (payload) {
    drawScriptureVersePayload(ctx, payload, canvasWidth, canvasHeight)
    ctx.restore()
    return
  }

  // Authoring/preview: render the placeholder's own sample content through the same
  // verse-renderer path as live, so all style fields preview accurately. Empty
  // placeholders (no reference and no verse) fall through and draw nothing.
  if (element.reference || element.verseText) {
    drawScriptureVersePayload(
      ctx,
      authoringScripturePayload(element),
      canvasWidth,
      canvasHeight
    )
    ctx.restore()
    return
  }

  const fontScale = surfaceFontScale(canvasWidth, canvasHeight)
  const verseFontSize = element.fontSize * fontScale
  const refFontSize = element.referenceFontSize * fontScale
  const refSpacing = refFontSize * 1.8

  ctx.font = buildFontString(
    verseFontSize,
    element.fontWeight,
    element.fontFamily,
    element.italic
  )
  const verseLines = wrapText(ctx, element.verseText || " ", w)

  const verseH = element.reference ? h - refSpacing : h

  drawTextLines(
    ctx,
    verseLines,
    { ...element, underline: false },
    x,
    y,
    w,
    verseH,
    fontScale
  )

  if (element.reference) {
    ctx.font = buildFontString(
      refFontSize,
      element.fontWeight,
      element.fontFamily,
      true
    )
    ctx.fillStyle = element.referenceColor
    ctx.textBaseline = "top"
    ctx.textAlign = element.horizontalAlign

    let refX: number
    switch (element.horizontalAlign) {
      case "center":
        refX = x + w / 2
        break
      case "right":
        refX = x + w
        break
      default:
        refX = x
    }

    const verseLineH = verseFontSize * element.lineHeight
    const verseTotalH = verseLines.length * verseLineH
    let verseStartY: number
    switch (element.verticalAlign) {
      case "middle":
        verseStartY = y + (verseH - verseTotalH) / 2
        break
      case "bottom":
        verseStartY = y + verseH - verseTotalH
        break
      default:
        verseStartY = y
    }

    const refY = verseStartY + verseTotalH + refFontSize * 0.6

    if (element.shadow) {
      ctx.shadowColor = element.shadow.color
      ctx.shadowOffsetX = element.shadow.offsetX
      ctx.shadowOffsetY = element.shadow.offsetY
      ctx.shadowBlur = element.shadow.blur
    }

    const refLabel = element.translation
      ? `— ${element.reference} (${element.translation})`
      : `— ${element.reference}`
    ctx.fillText(refLabel, refX, refY)

    ctx.shadowColor = "transparent"
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.shadowBlur = 0
  }

  ctx.restore()
}

export function getTextLineCount(
  ctx: CanvasRenderingContext2D,
  element: SlideTextElement,
  canvasWidth: number,
  canvasHeight: number
): number {
  const w = (element.width / 100) * canvasWidth
  const fontSize =
    element.fontSize * surfaceFontScale(canvasWidth, canvasHeight)
  ctx.font = buildFontString(
    fontSize,
    element.fontWeight,
    element.fontFamily,
    element.italic
  )
  let rawText = applyTextTransform(element.text, element.textTransform)
  const listType = element.listType ?? "none"
  if (listType !== "none") {
    const rawLines = rawText.split("\n")
    rawText = rawLines
      .map((line, i) => (listType === "bullet" ? "• " : `${i + 1}. `) + line)
      .join("\n")
  }
  return wrapTextWithHardBreaks(ctx, rawText, w).length
}

export function getTextWordCount(element: SlideTextElement): number {
  return element.text.split(/\s+/).filter(Boolean).length
}
