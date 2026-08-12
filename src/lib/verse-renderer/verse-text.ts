import type { BroadcastTheme, VerseRenderData } from "@/types/broadcast"
import { applyTextTransform } from "@/lib/canvas-draw"
import {
  alignX,
  drawTextDecorationLine,
  hexToRgba,
  resolveHorizontalAlign,
  resolveTextDecoration,
  resolveTextTransform,
  roundRect,
} from "./text-style"
import {
  buildFontForToken,
  buildRenderTokens,
  parseInterlinearTokens,
  usesTokenLayout,
  wrapStyledText,
  wrapTextMeasured,
  type MeasuredLine,
  type RenderToken,
  type WrappedStyledLine,
  type WrappedVerseContent,
} from "./verse-tokens"

/**
 * The text-drawing passes for verse rendering: the reference line, and the verse
 * body (plain, interlinear, and styled two-pass highlight/text paths). Consumes
 * the tokenised/wrapped output from `verse-tokens` and the primitives from
 * `text-style`.
 */

/**
 * Token width for positioning. `wrapStyledText` records each token's width, so
 * this is normally a field read; the measured fallback keeps the function
 * correct if it is ever handed tokens produced elsewhere.
 */
function measureToken(
  ctx: CanvasRenderingContext2D,
  token: RenderToken,
  theme: BroadcastTheme
): number {
  if (token.width !== undefined) return token.width
  ctx.save()
  ctx.font = buildFontForToken(token, theme)
  const w = ctx.measureText(token.text).width
  ctx.restore()
  return w
}

export function drawReference(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  text: string,
  textRectX: number,
  textRectWidth: number,
  y: number
): number {
  const ref = theme.reference
  const transformed = applyTextTransform(
    ref.uppercase ? text.toUpperCase() : text,
    resolveTextTransform(ref.textTransform)
  )
  const refAlign = resolveHorizontalAlign(
    ref.horizontalAlign,
    theme.layout.textAlign,
    false
  )
  const refDecoration = resolveTextDecoration(ref.textDecoration)

  ctx.save()
  const refItalic = ref.fontStyle === "italic" ? "italic " : ""
  ctx.font = `${refItalic}${ref.fontWeight} ${ref.fontSize}px "${ref.fontFamily}", sans-serif`
  ctx.fillStyle = ref.color
  ctx.textBaseline = "top"

  if (ref.letterSpacing > 0) {
    try {
      ctx.letterSpacing = `${ref.letterSpacing}px`
    } catch {
      /* unsupported in some WebViews */
    }
  }

  const canvasAlign = refAlign === "justify" ? "left" : refAlign
  ctx.textAlign = canvasAlign
  const x = alignX(canvasAlign, textRectX, textRectWidth)

  if (ref.shadow) {
    ctx.save()
    ctx.shadowColor = ref.shadow.color
    ctx.shadowBlur = ref.shadow.blur
    ctx.shadowOffsetX = ref.shadow.x
    ctx.shadowOffsetY = ref.shadow.y
    ctx.fillText(transformed, x, y)
    ctx.restore()
  }

  if (ref.outline) {
    ctx.save()
    ctx.strokeStyle = ref.outline.color
    ctx.lineWidth = ref.outline.width
    ctx.strokeText(transformed, x, y)
    ctx.restore()
  }

  if (!ref.shadow) {
    ctx.fillText(transformed, x, y)
  }

  const drawnWidth = Math.min(
    textRectWidth,
    Math.max(1, ctx.measureText(transformed).width)
  )
  drawTextDecorationLine(
    ctx,
    refDecoration,
    ref.color,
    refAlign,
    x,
    y,
    drawnWidth,
    ref.fontSize,
    textRectX
  )
  ctx.restore()

  const refLineHeight = ref.lineHeight ?? 1.4
  return ref.fontSize * refLineHeight
}

function drawStyledLinesPass(
  ctx: CanvasRenderingContext2D,
  lines: WrappedStyledLine[],
  theme: BroadcastTheme,
  textRectX: number,
  textRectWidth: number,
  startY: number,
  lineHeightPx: number,
  verseAlign: "left" | "center" | "right" | "justify",
  pass: "highlight" | "text"
): void {
  const vt = theme.verseText

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    const y = startY + li * lineHeightPx
    const isJustified = verseAlign === "justify" && li < lines.length - 1

    let startX: number
    if (isJustified) {
      startX = textRectX
    } else if (verseAlign === "center") {
      startX = textRectX + (textRectWidth - line.totalWidth) / 2
    } else if (verseAlign === "right") {
      startX = textRectX + textRectWidth - line.totalWidth
    } else {
      startX = textRectX
    }

    // For justified text, compute extra gap between words. Token widths were
    // measured once during wrapping, so reuse them instead of re-measuring.
    let justifyGap = 0
    if (isJustified) {
      const wordTokens = line.tokens.filter((t) => !/^ +$/.test(t.text))
      if (wordTokens.length > 1) {
        const wordsWidth = wordTokens.reduce(
          (sum, t) => sum + measureToken(ctx, t, theme),
          0
        )
        justifyGap = (textRectWidth - wordsWidth) / (wordTokens.length - 1)
      }
    }

    if (pass === "highlight") {
      let cursorX = startX
      let runStartX = startX
      let runWidth = 0
      let runHighlight: string | undefined = undefined
      const highlightH = vt.fontSize * 1.15
      const pad = 3

      for (const token of line.tokens) {
        const isSpace = /^ +$/.test(token.text)
        if (isJustified && isSpace) continue

        const tokenWidth = measureToken(ctx, token, theme)

        if (token.highlight === runHighlight) {
          runWidth = cursorX + tokenWidth - runStartX
        } else {
          if (runHighlight) {
            ctx.save()
            ctx.globalAlpha = 0.7
            ctx.fillStyle = runHighlight
            roundRect(
              ctx,
              runStartX - pad,
              y - pad,
              runWidth + pad * 2,
              highlightH,
              3
            )
            ctx.fill()
            ctx.restore()
          }
          runStartX = cursorX
          runWidth = tokenWidth
          runHighlight = token.highlight
        }

        cursorX += tokenWidth
        if (isJustified && !isSpace) cursorX += justifyGap
      }
      if (runHighlight) {
        ctx.save()
        ctx.globalAlpha = 0.7
        ctx.fillStyle = runHighlight
        roundRect(
          ctx,
          runStartX - pad,
          y - pad,
          runWidth + pad * 2,
          highlightH,
          3
        )
        ctx.fill()
        ctx.restore()
      }
    } else {
      let cursorX = startX
      let ulStartX = 0
      let ulEndX = 0
      let ulActive = false
      let ulColor = vt.color

      for (const token of line.tokens) {
        const isSpace = /^ +$/.test(token.text)
        if (isJustified && isSpace) continue

        ctx.save()
        ctx.font = buildFontForToken(token, theme)
        const tokenWidth = measureToken(ctx, token, theme)

        ctx.fillStyle = token.color ?? vt.color
        ctx.textBaseline = "top"
        ctx.textAlign = "left"

        if (vt.shadow) {
          ctx.save()
          ctx.shadowColor = vt.shadow.color
          ctx.shadowBlur = vt.shadow.blur
          ctx.shadowOffsetX = vt.shadow.x
          ctx.shadowOffsetY = vt.shadow.y
          ctx.fillText(token.text, cursorX, y)
          ctx.restore()
        }

        if (vt.outline) {
          ctx.save()
          ctx.strokeStyle = vt.outline.color
          ctx.lineWidth = vt.outline.width
          ctx.strokeText(token.text, cursorX, y)
          ctx.restore()
        }

        if (!vt.shadow) {
          ctx.fillText(token.text, cursorX, y)
        }

        if (token.underline) {
          if (!ulActive) {
            ulStartX = cursorX
            ulColor = token.color ?? vt.color
            ulActive = true
          }
          ulEndX = cursorX + tokenWidth
        } else if (ulActive) {
          ctx.save()
          ctx.strokeStyle = ulColor
          ctx.lineWidth = Math.max(1, vt.fontSize * 0.06)
          ctx.beginPath()
          ctx.moveTo(ulStartX, y + vt.fontSize * 0.92)
          ctx.lineTo(ulEndX, y + vt.fontSize * 0.92)
          ctx.stroke()
          ctx.restore()
          ulActive = false
        }

        cursorX += tokenWidth
        if (isJustified && !isSpace) cursorX += justifyGap
        ctx.restore()
      }
      if (ulActive) {
        ctx.save()
        ctx.strokeStyle = ulColor
        ctx.lineWidth = Math.max(1, vt.fontSize * 0.06)
        ctx.beginPath()
        ctx.moveTo(ulStartX, startY + li * lineHeightPx + vt.fontSize * 0.92)
        ctx.lineTo(ulEndX, startY + li * lineHeightPx + vt.fontSize * 0.92)
        ctx.stroke()
        ctx.restore()
      }
    }
  }
}

export function drawVerseText(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  verse: VerseRenderData,
  textRectX: number,
  textRectWidth: number,
  startY: number,
  wrapped?: WrappedVerseContent
): number {
  const vt = theme.verseText
  const vn = theme.verseNumbers
  const verseAlign = resolveHorizontalAlign(
    vt.horizontalAlign,
    theme.layout.textAlign,
    true
  )
  const verseDecoration = resolveTextDecoration(vt.textDecoration)
  const lineHeightPx = vt.fontSize * vt.lineHeight

  const isInterlinear = verse.segments.some((s) => s.isInterlinear)
  // Verses with per-token needs — styled spans, a distinctly-styled verse
  // number, or per-verse line breaks — render through the token path; plain
  // single-colour verses keep the cheaper path (byte-identical output).
  const useToken = usesTokenLayout(theme, verse.segments)

  ctx.save()
  ctx.font = `${vt.fontWeight} ${vt.fontSize}px "${vt.fontFamily}", serif`
  ctx.fillStyle = vt.color
  ctx.textBaseline = "top"
  ctx.textAlign = verseAlign === "justify" ? "left" : verseAlign

  if (vt.letterSpacing > 0) {
    try {
      ctx.letterSpacing = `${vt.letterSpacing}px`
    } catch {
      /* unsupported in some WebViews */
    }
  }

  // Styled path: two-pass rendering with per-token formatting
  if (useToken) {
    // Reuse the layout pass's wrapping when available; only re-wrap as a fallback.
    const styledLines =
      wrapped?.kind === "styled"
        ? wrapped.lines
        : wrapStyledText(
            ctx,
            buildRenderTokens(verse.segments, theme),
            textRectWidth,
            theme
          )
    drawStyledLinesPass(
      ctx,
      styledLines,
      theme,
      textRectX,
      textRectWidth,
      startY,
      lineHeightPx,
      verseAlign,
      "highlight"
    )
    drawStyledLinesPass(
      ctx,
      styledLines,
      theme,
      textRectX,
      textRectWidth,
      startY,
      lineHeightPx,
      verseAlign,
      "text"
    )

    // Theme-level text decoration
    if (verseDecoration !== "none") {
      let lineY = startY
      for (const line of styledLines) {
        drawTextDecorationLine(
          ctx,
          verseDecoration,
          vt.color,
          verseAlign,
          textRectX,
          lineY,
          line.totalWidth,
          vt.fontSize,
          textRectX
        )
        lineY += lineHeightPx
      }
    }

    ctx.restore()
    return styledLines.length * lineHeightPx
  }

  // Plain path: existing code for unstyled verses
  let fullText = ""
  for (const segment of verse.segments) {
    if (vn.visible && segment.verseNumber !== undefined) {
      fullText += `${segment.verseNumber} `
    }
    fullText += segment.text + " "
  }
  fullText = applyTextTransform(
    fullText.trim(),
    resolveTextTransform(vt.textTransform)
  )

  // Reuse the layout pass's wrapping when available; only re-wrap as a fallback.
  const wrappedLines: MeasuredLine[] =
    wrapped?.kind === "plain"
      ? wrapped.lines
      : wrapTextMeasured(ctx, fullText, textRectWidth)

  let currentY = startY
  const x = alignX(
    verseAlign === "justify" ? "left" : verseAlign,
    textRectX,
    textRectWidth
  )

  const vtItalic = vt.fontStyle === "italic" ? "italic " : ""
  const normalFont = `${vtItalic}${vt.fontWeight} ${vt.fontSize}px "${vt.fontFamily}", serif`
  const translitFontSize = Math.round(vt.fontSize * 0.75)
  const translitFont = `italic ${vt.fontWeight} ${translitFontSize}px "${vt.fontFamily}", serif`
  const translitColor =
    vt.color.startsWith("#") && vt.color.length >= 7
      ? hexToRgba(vt.color, 0.55)
      : vt.color

  const drawStyledLine = (line: string, drawX: number, drawY: number) => {
    if (vt.shadow) {
      ctx.save()
      ctx.shadowColor = vt.shadow.color
      ctx.shadowBlur = vt.shadow.blur
      ctx.shadowOffsetX = vt.shadow.x
      ctx.shadowOffsetY = vt.shadow.y
      ctx.fillText(line, drawX, drawY)
      ctx.restore()
    }

    if (vt.outline) {
      ctx.save()
      ctx.strokeStyle = vt.outline.color
      ctx.lineWidth = vt.outline.width
      ctx.strokeText(line, drawX, drawY)
      ctx.restore()
    }

    if (!vt.shadow) {
      ctx.fillText(line, drawX, drawY)
    }
  }

  // Actual drawn width of an interlinear line: normal tokens in the body font,
  // transliteration markers in the smaller italic font. The wrap-time
  // `measured.width` is measured entirely in the body font, so it overstates the
  // real width (translits render at 0.75×) — using it for centering would push
  // the line off-centre. Measuring per token here matches what's drawn.
  const measureInterlinearWidth = (line: string): number => {
    let width = 0
    for (const token of parseInterlinearTokens(line)) {
      ctx.font = token.type === "translit" ? translitFont : normalFont
      width += ctx.measureText(token.text).width
    }
    return width
  }

  const drawInterlinearLine = (line: string, startX: number, drawY: number) => {
    const tokens = parseInterlinearTokens(line)
    let cursorX = startX
    // We position each token ourselves via `cursorX` (a left edge), so the
    // canvas must anchor text at that left edge. The body theme may set
    // `textAlign` to center/right (line 333); leaving it would make the canvas
    // re-anchor every token on its cursor point, overlapping them. Force left.
    ctx.save()
    ctx.textAlign = "left"
    for (const token of tokens) {
      if (token.type === "translit") {
        ctx.save()
        ctx.font = translitFont
        ctx.fillStyle = translitColor
        if (vt.shadow) {
          ctx.shadowColor = vt.shadow.color
          ctx.shadowBlur = vt.shadow.blur
          ctx.shadowOffsetX = vt.shadow.x
          ctx.shadowOffsetY = vt.shadow.y
        }
        ctx.fillText(token.text, cursorX, drawY)
        cursorX += ctx.measureText(token.text).width
        ctx.restore()
      } else {
        ctx.save()
        ctx.font = normalFont
        ctx.fillStyle = vt.color
        if (vt.shadow) {
          ctx.shadowColor = vt.shadow.color
          ctx.shadowBlur = vt.shadow.blur
          ctx.shadowOffsetX = vt.shadow.x
          ctx.shadowOffsetY = vt.shadow.y
        }
        if (vt.outline) {
          ctx.strokeStyle = vt.outline.color
          ctx.lineWidth = vt.outline.width
          ctx.strokeText(token.text, cursorX, drawY)
        }
        ctx.fillText(token.text, cursorX, drawY)
        cursorX += ctx.measureText(token.text).width
        ctx.restore()
      }
    }
    ctx.restore()
  }

  for (const [index, measured] of wrappedLines.entries()) {
    const line = measured.text
    const isJustifiedLine =
      verseAlign === "justify" &&
      index < wrappedLines.length - 1 &&
      /\s+/.test(line)

    if (isInterlinear && !isJustifiedLine) {
      // Draw token-by-token from a computed left edge. Centre/right anchoring
      // uses the real drawn width (translits at 0.75×), not the body-font
      // `measured.width`, which overstates it and would shift the line.
      const drawnWidth =
        verseAlign === "center" || verseAlign === "right"
          ? measureInterlinearWidth(line)
          : measured.width
      const lineStartX =
        verseAlign === "center"
          ? x - drawnWidth / 2
          : verseAlign === "right"
            ? x - drawnWidth
            : x
      drawInterlinearLine(line, lineStartX, currentY)
    } else if (isJustifiedLine) {
      const words = line.trim().split(/\s+/).filter(Boolean)
      if (words.length > 1) {
        const wordsWidth = words.reduce(
          (sum, word) => sum + ctx.measureText(word).width,
          0
        )
        const gap = (textRectWidth - wordsWidth) / (words.length - 1)
        let cursorX = textRectX
        for (const word of words) {
          if (isInterlinear) {
            drawInterlinearLine(word, cursorX, currentY)
          } else {
            drawStyledLine(word, cursorX, currentY)
          }
          cursorX += ctx.measureText(word).width + gap
        }
      } else {
        if (isInterlinear) {
          drawInterlinearLine(line, textRectX, currentY)
        } else {
          drawStyledLine(line, textRectX, currentY)
        }
      }
      drawTextDecorationLine(
        ctx,
        verseDecoration,
        vt.color,
        "left",
        textRectX,
        currentY,
        textRectWidth,
        vt.fontSize,
        textRectX
      )
    } else {
      drawStyledLine(line, x, currentY)
      const lineWidth = Math.min(textRectWidth, Math.max(1, measured.width))
      drawTextDecorationLine(
        ctx,
        verseDecoration,
        vt.color,
        verseAlign,
        x,
        currentY,
        lineWidth,
        vt.fontSize,
        textRectX
      )
    }
    currentY += lineHeightPx
  }

  ctx.restore()

  return currentY - startY
}
