import type { VerseStyle, VerseSegment } from "@/types/broadcast"
import { applyTextTransform } from "@/lib/canvas-draw"
import { resolveTextTransform } from "./text-style"

/**
 * Text tokenisation, font building, and word-wrapping for verse rendering.
 *
 * Turns verse segments into render tokens (handling verse numbers, styled
 * spans, and interlinear transliteration markers) and wraps them to a width.
 * Pure/measurement-only — the drawing passes in `verse-text.ts` consume these.
 */

/** A wrapped line plus its width, measured in the ctx's current font. */
export interface MeasuredLine {
  text: string
  width: number
}

/**
 * Word-wrap `text` to `maxWidth`, returning each line with its measured width.
 *
 * Cost is O(words): every word is measured exactly once and the joining space
 * width is cached, instead of the previous O(words²) that re-measured the whole
 * growing line on each word. Line widths are additive (word + space + word),
 * which matches the additive `measureText` model the renderer uses and is exact
 * under the tests' proportional-width fake ctx. With real kerning / letter
 * spacing the additive total can differ from measuring the whole string by a
 * sub-pixel-per-boundary amount, which does not move wrap points in practice.
 */
export function wrapTextMeasured(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): MeasuredLine[] {
  const words = text.split(" ")
  const spaceWidth = ctx.measureText(" ").width
  const lines: MeasuredLine[] = []
  let currentLine = ""
  let currentWidth = 0

  for (const word of words) {
    if (currentLine === "") {
      // First word of a line always lands, even if it alone exceeds maxWidth —
      // matches the historical `currentLine`-guarded behaviour.
      currentLine = word
      currentWidth = ctx.measureText(word).width
      continue
    }
    const wordWidth = ctx.measureText(word).width
    const testWidth = currentWidth + spaceWidth + wordWidth
    if (testWidth > maxWidth) {
      lines.push({ text: currentLine, width: currentWidth })
      currentLine = word
      currentWidth = wordWidth
    } else {
      currentLine = `${currentLine} ${word}`
      currentWidth = testWidth
    }
  }

  if (currentLine) {
    lines.push({ text: currentLine, width: currentWidth })
  }

  return lines
}

/** Word-wrap `text` to `maxWidth`, returning only the line strings. */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  return wrapTextMeasured(ctx, text, maxWidth).map((l) => l.text)
}

/**
 * Like `wrapText`, but honours **explicit** newlines: the text is split on
 * `\n` into hard lines first, and each hard line is then word-wrapped to
 * `maxWidth`. An empty (or whitespace-only) hard line is preserved as a blank
 * line so stanza spacing survives.
 *
 * `wrapText` alone splits only on spaces, so a `\n` would stay inside a token
 * and canvas `fillText` collapses it — losing the author's line breaks. Slide
 * text elements (e.g. generated song lyrics, which join their lines with `\n`)
 * wrap through here so those breaks render as written.
 */
export function wrapTextWithHardBreaks(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  return text.split("\n").flatMap((segment) => {
    const wrapped = wrapText(ctx, segment, maxWidth)
    return wrapped.length > 0 ? wrapped : [""]
  })
}

export interface InterlinearToken {
  text: string
  type: "normal" | "translit"
}

export function parseInterlinearTokens(text: string): InterlinearToken[] {
  const tokens: InterlinearToken[] = []
  const re = /(\([^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: text.slice(lastIndex, match.index), type: "normal" })
    }
    tokens.push({ text: match[1], type: "translit" })
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex), type: "normal" })
  }
  return tokens
}

// ── Styled span rendering ──

export interface RenderToken {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  highlight?: string
  /**
   * Override the body font size for this token (e.g. a smaller, superscript
   * verse number). Missing = the theme's verse-text size. A smaller size drawn
   * on the shared top baseline naturally reads as a raised superscript.
   */
  fontSize?: number
  /**
   * A hard line-break marker (no glyphs): flushes the current wrapped line so
   * the next token starts a new line. Used to put each verse on its own line.
   */
  break?: boolean
  /** Width of `text` in this token's font, set by {@link wrapStyledText}. */
  width?: number
}

export interface WrappedStyledLine {
  tokens: RenderToken[]
  totalWidth: number
}

/**
 * The wrapped verse body, computed once during layout and reused by the draw
 * pass so a verse is never word-wrapped twice per render (nor re-wrapped every
 * animation frame once the layout is memoised). `plain` covers both the plain
 * and interlinear draw paths, which share identical line breaking.
 */
export type WrappedVerseContent =
  | { kind: "plain"; lines: MeasuredLine[] }
  | { kind: "styled"; lines: WrappedStyledLine[] }

export function hasAnySpans(segments: VerseSegment[]): boolean {
  return segments.some((s) => s.spans && s.spans.length > 0)
}

/**
 * Whether the verse number needs to be drawn as its own visual run rather than
 * flowing in the body text: a colour distinct from the body, or a superscript
 * (smaller/raised). When neither holds, the cheaper plain draw path renders the
 * number inline in the body colour — byte-identical to the historical output.
 */
export function verseNumberStyled(
  theme: VerseStyle,
  segments: VerseSegment[]
): boolean {
  const vn = theme.verseNumbers
  if (!vn.visible) return false
  if (!segments.some((s) => s.verseNumber !== undefined)) return false
  return vn.superscript || vn.color !== theme.verseText.color
}

/**
 * Whether a verse must be rendered through the token/styled path (per-token
 * fonts + colours + hard breaks) rather than the plain single-colour path.
 * Interlinear always uses the plain path (it has its own tokeniser). Kept as one
 * predicate so the draw pass and the measurement pass in `layout.ts` agree on
 * the path — otherwise cached wrapping and drawing would disagree.
 */
export function usesTokenLayout(
  theme: VerseStyle,
  segments: VerseSegment[]
): boolean {
  if (segments.some((s) => s.isInterlinear)) return false
  if (hasAnySpans(segments)) return true
  if (verseNumberStyled(theme, segments)) return true
  return !!theme.layout.breakPerVerse && segments.length > 1
}

export function buildRenderTokens(
  segments: VerseSegment[],
  theme: VerseStyle
): RenderToken[] {
  const vt = theme.verseText
  const vn = theme.verseNumbers
  const textTransform = resolveTextTransform(vt.textTransform)
  // Each verse on its own line only makes sense with 2+ verses; a lone verse
  // renders identically with or without the flag.
  const breakPerVerse = !!theme.layout.breakPerVerse && segments.length > 1
  // Superscript numbers render at the dedicated (smaller) size; otherwise the
  // number keeps the body size and only its colour differs.
  const numberFontSize = vn.superscript ? vn.fontSize : undefined
  const tokens: RenderToken[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (breakPerVerse && i > 0) {
      tokens.push({ text: "", break: true })
    }
    if (vn.visible && segment.verseNumber !== undefined) {
      tokens.push({
        text: applyTextTransform(`${segment.verseNumber} `, textTransform),
        color: vn.color,
        fontSize: numberFontSize,
      })
    }

    const text = segment.text
    const spans = segment.spans
    if (!spans || spans.length === 0) {
      tokens.push({ text: applyTextTransform(text + " ", textTransform) })
      continue
    }

    const sorted = [...spans].sort((a, b) => a.start - b.start)
    let cursor = 0
    for (const span of sorted) {
      if (span.start > cursor) {
        tokens.push({
          text: applyTextTransform(
            text.slice(cursor, span.start),
            textTransform
          ),
        })
      }
      const s = span.style
      tokens.push({
        text: applyTextTransform(
          text.slice(span.start, span.end),
          textTransform
        ),
        bold: s.bold,
        italic: s.italic,
        underline: s.underline,
        color: s.color,
        highlight: s.highlight,
      })
      cursor = span.end
    }
    if (cursor < text.length) {
      tokens.push({
        text: applyTextTransform(text.slice(cursor) + " ", textTransform),
      })
    } else {
      tokens.push({ text: " " })
    }
  }

  // Trim trailing space from last token
  if (tokens.length > 0) {
    const last = tokens[tokens.length - 1]
    last.text = last.text.trimEnd()
    if (last.text.length === 0) tokens.pop()
  }

  return tokens
}

export function buildFontForToken(
  token: RenderToken,
  theme: VerseStyle
): string {
  const vt = theme.verseText
  const style = token.italic ? "italic " : ""
  const weight = token.bold ? Math.min(900, vt.fontWeight + 300) : vt.fontWeight
  const size = token.fontSize ?? vt.fontSize
  return `${style}${weight} ${size}px "${vt.fontFamily}", serif`
}

interface StyledWord {
  text: string
  width: number
  token: RenderToken
  /** A hard line break rather than a real word (from a `break` token). */
  isBreak?: boolean
}

export function wrapStyledText(
  ctx: CanvasRenderingContext2D,
  tokens: RenderToken[],
  maxWidth: number,
  theme: VerseStyle
): WrappedStyledLine[] {
  const lines: WrappedStyledLine[] = []
  let currentTokens: RenderToken[] = []
  let currentWidth = 0
  const spaceWidth = ctx.measureText(" ").width

  // Font strings depend only on bold/italic within a single call; cache them so
  // we build each distinct font once and skip per-token save/restore (the outer
  // measure/draw pass already brackets us with save()/restore()).
  const fontCache = new Map<string, string>()
  const fontFor = (token: RenderToken): string => {
    const key = `${token.bold ? 1 : 0}${token.italic ? 1 : 0}:${token.fontSize ?? ""}`
    let font = fontCache.get(key)
    if (font === undefined) {
      font = buildFontForToken(token, theme)
      fontCache.set(key, font)
    }
    return font
  }

  // Carry each split word's measured width onto its cloned token so the draw
  // passes never have to re-measure to position glyphs/underlines/highlights.
  const cloneToken = (
    token: RenderToken,
    text: string,
    width: number
  ): RenderToken => ({
    text,
    bold: token.bold,
    italic: token.italic,
    underline: token.underline,
    color: token.color,
    highlight: token.highlight,
    fontSize: token.fontSize,
    width,
  })

  const words: StyledWord[] = []
  for (const token of tokens) {
    if (token.break) {
      words.push({ text: "", width: 0, token, isBreak: true })
      continue
    }
    const parts = token.text.split(/( +)/)
    let accumulated = ""
    for (const part of parts) {
      if (/^ +$/.test(part)) {
        if (accumulated.length > 0) {
          ctx.font = fontFor(token)
          words.push({
            text: accumulated,
            width: ctx.measureText(accumulated).width,
            token,
          })
          accumulated = ""
        }
        words.push({ text: part, width: spaceWidth * part.length, token })
      } else if (part.length > 0) {
        accumulated += part
      }
    }
    if (accumulated.length > 0) {
      ctx.font = fontFor(token)
      words.push({
        text: accumulated,
        width: ctx.measureText(accumulated).width,
        token,
      })
    }
  }

  for (const word of words) {
    if (word.isBreak) {
      // Force a new line: flush the current line (minus trailing spaces). An
      // empty current line means we're already at a line start, so skip it
      // rather than emit a blank line.
      if (currentTokens.length > 0) {
        while (
          currentTokens.length > 0 &&
          /^ *$/.test(currentTokens[currentTokens.length - 1].text)
        ) {
          const removed = currentTokens.pop()!
          currentWidth -= removed.width ?? 0
        }
        lines.push({ tokens: currentTokens, totalWidth: currentWidth })
        currentTokens = []
        currentWidth = 0
      }
      continue
    }
    const isSpace = /^ +$/.test(word.text)
    if (isSpace) {
      if (currentTokens.length > 0) {
        currentWidth += word.width
        currentTokens.push(cloneToken(word.token, word.text, word.width))
      }
      continue
    }
    if (currentWidth + word.width > maxWidth && currentTokens.length > 0) {
      // Trim trailing spaces from current line, subtracting the widths we
      // already recorded on each token.
      while (
        currentTokens.length > 0 &&
        /^ *$/.test(currentTokens[currentTokens.length - 1].text)
      ) {
        const removed = currentTokens.pop()!
        currentWidth -= removed.width ?? 0
      }
      lines.push({ tokens: currentTokens, totalWidth: currentWidth })
      currentTokens = []
      currentWidth = 0
    }
    currentTokens.push(cloneToken(word.token, word.text, word.width))
    currentWidth += word.width
  }

  if (currentTokens.length > 0) {
    while (
      currentTokens.length > 0 &&
      /^ *$/.test(currentTokens[currentTokens.length - 1].text)
    ) {
      const removed = currentTokens.pop()!
      currentWidth -= removed.width ?? 0
    }
    lines.push({ tokens: currentTokens, totalWidth: currentWidth })
  }

  return lines
}
