/**
 * Renders a BibleHub-style "Lexical Summary" card to a PNG data URL on an
 * offscreen canvas. The result is embedded in a slide's full-bleed image
 * element so it flows through the existing slide broadcast/queue/NDI pipeline
 * with pixel-perfect fidelity (colored labels, wrapping rows, RTL originals).
 */

import { DESIGN_WIDTH, DESIGN_HEIGHT } from "@/lib/canvas-constants"

export interface LexiconCardData {
  reference: string
  strong?: string
  summary?: string
  lemma: string
  partOfSpeech?: string
  transliteration?: string
  pronunciation?: string
  kjvUsage?: string
  wordOrigin?: string
  definition?: string
  isHebrew: boolean
}

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

/**
 * Draws a "Label: value" row with a blue label and dark wrapping value that
 * hangs-indents under the text (not under the label). Returns the y baseline
 * after the row.
 */
function drawRow(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  maxRight: number,
  opts: { valueFont?: string; lineHeight?: number; fontSize?: number } = {}
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

export function renderLexiconCardToDataUrl(d: LexiconCardData): string {
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""

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

  let y = 232

  // Summary line: "translit: short gloss"
  if (d.summary) {
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

  // Original Word (hero — larger, serif; Hebrew/Greek render via system fallback)
  {
    ctx.textAlign = "left"
    ctx.font = `600 40px ${SANS}`
    ctx.fillStyle = COLORS.label
    const labelText = "Original Word: "
    ctx.fillText(labelText, padX, y)
    const lw = ctx.measureText(labelText).width
    ctx.font = `600 68px ${SERIF}`
    ctx.fillStyle = COLORS.original
    ctx.fillText(d.lemma, padX + lw, y + 8)
    y += 96
  }

  const rows: Array<[string, string | undefined]> = [
    ["Part of Speech", d.partOfSpeech],
    ["Transliteration", d.transliteration],
    ["Pronunciation", d.pronunciation],
    ["KJV Usage", d.kjvUsage],
    ["Word Origin", d.wordOrigin],
  ]
  for (const [label, value] of rows) {
    if (!value) continue
    y = drawRow(ctx, label, value, padX, y, maxRight, { fontSize: 38 })
    y += 12
  }

  // Definition (full width, may be long)
  if (d.definition) {
    y += 10
    y = drawRow(ctx, "Definition", d.definition, padX, y, maxRight, {
      fontSize: 38,
    })
  }

  return canvas.toDataURL("image/png")
}
