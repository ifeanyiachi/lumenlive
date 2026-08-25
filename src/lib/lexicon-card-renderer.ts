/**
 * Renders a BibleHub-style "Lexical Summary" card to a PNG data URL on an
 * offscreen canvas. The result is embedded in a slide's full-bleed image
 * element so it flows through the existing slide broadcast/queue/NDI pipeline
 * with pixel-perfect fidelity (colored labels, wrapping rows, RTL originals).
 */

import { DESIGN_WIDTH, DESIGN_HEIGHT } from "@/lib/canvas-constants"
import type { InlineStyle, StyledSpan } from "@/types/verse-edit"
import type { LexiconCardData, LexiconField } from "@/types/lexicon"

export type { LexiconCardData, LexiconField } from "@/types/lexicon"

const W = DESIGN_WIDTH
const H = DESIGN_HEIGHT

const COLORS = {
  bg: "#f8fafc",
  headerBar: "#e8edf3",
  headerText: "#0f172a",
  summary: "#0f172a",
  label: "#1d4ed8",
  value: "#1e293b",
  original: "#0f172a",
  muted: "#64748b",
}

const SANS = "Inter, 'Segoe UI', Arial, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : [""]
}

// ── Styled (inline-formatted) text drawing ──────────────────────────────────
//
// Draws a run of text carrying per-character InlineStyle spans (bold/italic/
// underline/color/highlight), word-wrapped between `firstX`/`x` and `maxRight`.
// The wrapping mirrors the plain greedy word-wrap used elsewhere in this file, so
// a field with *no* spans lays out identically — the styled path is only entered
// when a field actually has formatting.

interface StyledDrawOpts {
  /** Left edge of the first line (may sit after a label for hanging indent). */
  firstX: number
  /** Left edge of continuation (wrapped) lines. */
  x: number
  /** Baseline of the first line. */
  y: number
  /** Right edge the text must not cross. */
  maxRight: number
  fontSize: number
  lineHeight: number
  fontFamily: string
  baseColor: string
  /** Default font weight for un-bolded runs (e.g. 700 for the summary line). */
  baseWeight?: number
  baseItalic?: boolean
}

interface StyledRun {
  text: string
  style: InlineStyle | null
}

interface StyledWord {
  runs: StyledRun[]
}

function fontString(
  size: number,
  family: string,
  weight: number,
  italic: boolean
): string {
  return `${italic ? "italic " : ""}${weight} ${size}px ${family}`
}

/** Per-character style map: the last span covering an index wins (post-merge
 * spans don't overlap, but this stays well-defined if they ever do). */
function buildCharStyles(
  length: number,
  spans: StyledSpan[]
): Array<InlineStyle | null> {
  const styles: Array<InlineStyle | null> = new Array(length).fill(null)
  for (const span of spans) {
    const start = Math.max(0, span.start)
    const end = Math.min(length, span.end)
    for (let i = start; i < end; i++) styles[i] = span.style
  }
  return styles
}

function stylesRefEqual(
  a: InlineStyle | null,
  b: InlineStyle | null
): boolean {
  return a === b
}

/** Split text into words (whitespace-delimited), each word carrying its own
 * sub-runs where an inline style boundary falls inside the word. */
function splitStyledWords(
  text: string,
  charStyles: Array<InlineStyle | null>
): StyledWord[] {
  const words: StyledWord[] = []
  let i = 0
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++
    if (i >= text.length) break
    const wordStart = i
    while (i < text.length && !/\s/.test(text[i])) i++
    const wordEnd = i

    const runs: StyledRun[] = []
    let j = wordStart
    while (j < wordEnd) {
      const style = charStyles[j]
      let k = j + 1
      while (k < wordEnd && stylesRefEqual(charStyles[k], style)) k++
      runs.push({ text: text.slice(j, k), style })
      j = k
    }
    words.push({ runs })
  }
  return words
}

/**
 * Draws `text` with inline `spans`, wrapping greedily. Returns the y baseline
 * after the last line (same convention as {@link drawRow}: one `lineHeight` past
 * the final drawn line).
 */
function drawStyledRuns(
  ctx: CanvasRenderingContext2D,
  text: string,
  spans: StyledSpan[],
  o: StyledDrawOpts
): number {
  const baseWeight = o.baseWeight ?? 400
  const charStyles = buildCharStyles(text.length, spans)
  const words = splitStyledWords(text, charStyles)

  const runFont = (style: InlineStyle | null): string =>
    fontString(
      o.fontSize,
      o.fontFamily,
      style?.bold ? 700 : baseWeight,
      !!style?.italic || !!o.baseItalic
    )
  const runWidth = (run: StyledRun): number => {
    ctx.font = runFont(run.style)
    return ctx.measureText(run.text).width
  }
  const wordWidth = (word: StyledWord): number =>
    word.runs.reduce((sum, run) => sum + runWidth(run), 0)

  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"
  ctx.font = fontString(o.fontSize, o.fontFamily, baseWeight, !!o.baseItalic)
  const spaceWidth = ctx.measureText(" ").width

  let cy = o.y
  let isFirst = true
  let lineWords: StyledWord[] = []
  let lineWidth = 0

  const drawLine = () => {
    let cx = isFirst ? o.firstX : o.x
    for (let wi = 0; wi < lineWords.length; wi++) {
      for (const run of lineWords[wi].runs) {
        ctx.font = runFont(run.style)
        const rw = ctx.measureText(run.text).width
        if (run.style?.highlight) {
          ctx.fillStyle = run.style.highlight
          ctx.fillRect(cx, cy - o.fontSize * 0.82, rw, o.fontSize * 1.08)
        }
        const color = run.style?.color ?? o.baseColor
        ctx.fillStyle = color
        ctx.fillText(run.text, cx, cy)
        if (run.style?.underline) {
          const uy = cy + o.fontSize * 0.14
          ctx.strokeStyle = color
          ctx.lineWidth = Math.max(1, o.fontSize / 18)
          ctx.beginPath()
          ctx.moveTo(cx, uy)
          ctx.lineTo(cx + rw, uy)
          ctx.stroke()
        }
        cx += rw
      }
      if (wi < lineWords.length - 1) cx += spaceWidth
    }
    cy += o.lineHeight
    isFirst = false
    lineWords = []
    lineWidth = 0
  }

  for (const word of words) {
    const ww = wordWidth(word)
    const limit = isFirst ? o.maxRight - o.firstX : o.maxRight - o.x
    const candidate = lineWords.length === 0 ? ww : lineWidth + spaceWidth + ww
    if (candidate > limit && lineWords.length > 0) {
      drawLine()
      lineWords = [word]
      lineWidth = ww
    } else {
      lineWords.push(word)
      lineWidth = candidate
    }
  }
  if (lineWords.length > 0) drawLine()
  else if (isFirst) cy += o.lineHeight

  return cy
}

/**
 * Draws a "Label: value" row with a blue label and dark wrapping value that
 * hangs-indents under the text (not under the label). Returns the y baseline
 * after the row. When `spans` are supplied the value is drawn with inline
 * formatting; otherwise the original plain path runs unchanged.
 */
function drawRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  maxRight: number,
  opts: {
    valueFont?: string
    lineHeight?: number
    fontSize?: number
    spans?: StyledSpan[]
  } = {}
): number {
  const fontSize = opts.fontSize ?? 40
  const lineHeight = opts.lineHeight ?? Math.round(fontSize * 1.35)
  const valueFont = opts.valueFont ?? `${fontSize}px ${SANS}`

  ctx.textBaseline = "alphabetic"
  ctx.textAlign = "left"

  // Label (blue, semibold)
  const labelText = `${label}: `
  ctx.font = `600 ${fontSize}px ${SANS}`
  ctx.fillStyle = COLORS.label
  ctx.fillText(labelText, x, y)
  const labelWidth = ctx.measureText(labelText).width

  // Styled value: hang-indent after the label, honoring inline formatting.
  if (opts.spans && opts.spans.length > 0) {
    return drawStyledRuns(ctx, value, opts.spans, {
      firstX: x + labelWidth,
      x,
      y,
      maxRight,
      fontSize,
      lineHeight,
      fontFamily: SANS,
      baseColor: COLORS.value,
    })
  }

  // Value (dark), wrapping. First line starts after the label; wrapped lines
  // hang-indent to the label's left edge for readability.
  ctx.font = valueFont
  ctx.fillStyle = COLORS.value
  const firstLineWidth = maxRight - (x + labelWidth)
  const contLineWidth = maxRight - x

  // Greedy wrap that accounts for the narrower first line.
  const words = value.split(/\s+/).filter(Boolean)
  let cy = y
  let line = ""
  let isFirst = true
  const flush = () => {
    if (isFirst) {
      ctx.fillText(line, x + labelWidth, cy)
      isFirst = false
    } else {
      ctx.fillText(line, x, cy)
    }
    line = ""
    cy += lineHeight
  }
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    const limit = isFirst ? firstLineWidth : contLineWidth
    if (ctx.measureText(candidate).width > limit && line) {
      flush()
      line = word
    } else {
      line = candidate
    }
  }
  if (line) flush()
  else if (isFirst) cy += lineHeight // label with empty value

  return cy
}

/** Draws the whole card onto `ctx` in design coordinates (0,0 → W,H). The
 * caller sizes/scales the canvas; the layout math here never changes, so the
 * projected (scale 1) output stays byte-identical. */
function drawLexiconCard(
  ctx: CanvasRenderingContext2D,
  d: LexiconCardData
): void {
  const padX = 96
  const maxRight = W - padX

  // Background
  ctx.fillStyle = COLORS.bg
  ctx.fillRect(0, 0, W, H)

  // Header bar
  ctx.fillStyle = COLORS.headerBar
  ctx.fillRect(0, 0, W, 132)
  ctx.fillStyle = COLORS.headerText
  ctx.font = `700 60px ${SANS}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "left"
  ctx.fillText("Lexical Summary", padX, 68)
  if (d.reference) {
    ctx.font = `500 34px ${SANS}`
    ctx.fillStyle = COLORS.muted
    ctx.textAlign = "right"
    const ref = d.strong ? `${d.reference}   ·   ${d.strong}` : d.reference
    ctx.fillText(ref, maxRight, 70)
  }

  const styleFor = (field: LexiconField): StyledSpan[] | undefined => {
    const spans = d.styles?.[field]
    return spans && spans.length > 0 ? spans : undefined
  }

  let y = 232

  // Summary line: "translit: short gloss"
  if (d.summary) {
    const spans = styleFor("summary")
    if (spans) {
      y = drawStyledRuns(ctx, d.summary, spans, {
        firstX: padX,
        x: padX,
        y,
        maxRight,
        fontSize: 52,
        lineHeight: 68,
        fontFamily: SANS,
        baseColor: COLORS.summary,
        baseWeight: 700,
      })
      y += 28
    } else {
      ctx.textAlign = "left"
      ctx.textBaseline = "alphabetic"
      ctx.font = `700 52px ${SANS}`
      ctx.fillStyle = COLORS.summary
      for (const line of wrap(ctx, d.summary, maxRight - padX)) {
        ctx.fillText(line, padX, y)
        y += 68
      }
      y += 28
    }
  }

  // Original Word (hero — larger, serif; Hebrew/Greek render via system fallback)
  {
    ctx.textAlign = "left"
    ctx.font = `600 40px ${SANS}`
    ctx.fillStyle = COLORS.label
    const labelText = "Original Word: "
    ctx.fillText(labelText, padX, y)
    const lw = ctx.measureText(labelText).width
    const spans = styleFor("lemma")
    if (spans) {
      // The hero value sits 8px below the label baseline, single line (a lemma is
      // one word) — draw it styled at that baseline; keep the fixed row advance.
      drawStyledRuns(ctx, d.lemma, spans, {
        firstX: padX + lw,
        x: padX + lw,
        y: y + 8,
        maxRight,
        fontSize: 68,
        lineHeight: 96,
        fontFamily: SERIF,
        baseColor: COLORS.original,
        baseWeight: 600,
      })
    } else {
      ctx.font = `600 68px ${SERIF}`
      ctx.fillStyle = COLORS.original
      ctx.fillText(d.lemma, padX + lw, y + 8)
    }
    y += 96
  }

  const rows: Array<[string, string | undefined, LexiconField]> = [
    ["Part of Speech", d.partOfSpeech, "partOfSpeech"],
    ["Transliteration", d.transliteration, "transliteration"],
    ["Pronunciation", d.pronunciation, "pronunciation"],
    ["KJV Usage", d.kjvUsage, "kjvUsage"],
    ["Word Origin", d.wordOrigin, "wordOrigin"],
  ]
  for (const [label, value, field] of rows) {
    if (!value) continue
    y = drawRow(ctx, label, value, padX, y, maxRight, {
      fontSize: 38,
      spans: styleFor(field),
    })
    y += 12
  }

  // Definition (full width, may be long)
  if (d.definition) {
    y += 10
    y = drawRow(ctx, "Definition", d.definition, padX, y, maxRight, {
      fontSize: 38,
      spans: styleFor("definition"),
    })
  }
}

/** Sizes/scales a canvas and draws the card onto it. `scale` < 1 renders a
 * smaller bitmap (same layout) — used for the editor's live preview so the heavy
 * full-resolution rasterize doesn't compete with typing/selection. */
function paintCard(
  canvas: HTMLCanvasElement,
  d: LexiconCardData,
  scale: number
): CanvasRenderingContext2D | null {
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  if (scale !== 1) ctx.scale(scale, scale)
  drawLexiconCard(ctx, d)
  return ctx
}

/**
 * Rasterizes the card to a PNG data URL. `scale` defaults to 1 (the projected,
 * byte-identical output embedded in the slide image element).
 */
export function renderLexiconCardToDataUrl(
  d: LexiconCardData,
  scale = 1
): string {
  const canvas = document.createElement("canvas")
  const ctx = paintCard(canvas, d, scale)
  if (!ctx) return ""
  return canvas.toDataURL("image/png")
}

/**
 * Draws the card directly onto an existing on-screen canvas (no `toDataURL`, no
 * base64 image to decode/composite) — used by the editor's live preview, which
 * updates frequently and must not compete with text selection. `scale` sets the
 * backing-store resolution; CSS stretches the canvas to its display box.
 */
export function renderLexiconCardToCanvas(
  canvas: HTMLCanvasElement,
  d: LexiconCardData,
  scale = 0.5
): void {
  paintCard(canvas, d, scale)
}
