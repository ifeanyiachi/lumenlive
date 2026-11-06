import type { JSONContent } from "@tiptap/react"
import type {
  InlineStyle,
  StyledSpan,
  StyledVerseSegment,
} from "@/types/verse-edit"

interface MarkAttrs {
  color?: string
}

function marksToInlineStyle(marks?: JSONContent["marks"]): InlineStyle | null {
  if (!marks || marks.length === 0) return null
  const style: InlineStyle = {}
  let hasStyle = false
  for (const mark of marks) {
    switch (mark.type) {
      case "bold":
        style.bold = true
        hasStyle = true
        break
      case "italic":
        style.italic = true
        hasStyle = true
        break
      case "underline":
        style.underline = true
        hasStyle = true
        break
      case "textStyle":
        if ((mark.attrs as MarkAttrs | undefined)?.color) {
          style.color = (mark.attrs as MarkAttrs).color
          hasStyle = true
        }
        break
      case "highlight":
        if ((mark.attrs as MarkAttrs | undefined)?.color) {
          style.highlight = (mark.attrs as MarkAttrs).color
          hasStyle = true
        }
        break
    }
  }
  return hasStyle ? style : null
}

function stylesEqual(a: InlineStyle, b: InlineStyle): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    (a.color ?? "") === (b.color ?? "") &&
    (a.highlight ?? "") === (b.highlight ?? "")
  )
}

export function tiptapToStyledSegments(
  json: JSONContent,
  originalSegments: StyledVerseSegment[]
): StyledVerseSegment[] {
  const paragraphs = json.content ?? []
  const fullText = paragraphs
    .map((p) => (p.content ?? []).map((node) => node.text ?? "").join(""))
    .join("\n")

  const rawSpans: StyledSpan[] = []
  let offset = 0
  for (let pi = 0; pi < paragraphs.length; pi++) {
    if (pi > 0) offset += 1
    const nodes = paragraphs[pi].content ?? []
    for (const node of nodes) {
      const text = node.text ?? ""
      if (text.length === 0) continue
      const style = marksToInlineStyle(node.marks)
      if (style) {
        rawSpans.push({ start: offset, end: offset + text.length, style })
      }
      offset += text.length
    }
  }

  const spans = mergeAdjacentSpans(rawSpans)

  return originalSegments.map((seg) => ({
    ...seg,
    text: fullText,
    spans: spans.length > 0 ? spans : undefined,
  }))
}

function mergeAdjacentSpans(spans: StyledSpan[]): StyledSpan[] {
  if (spans.length === 0) return []
  const merged: StyledSpan[] = [{ ...spans[0] }]
  for (let i = 1; i < spans.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = spans[i]
    if (prev.end === curr.start && stylesEqual(prev.style, curr.style)) {
      prev.end = curr.end
    } else {
      merged.push({ ...curr })
    }
  }
  return merged
}

function inlineStyleToMarks(style: InlineStyle): JSONContent["marks"] {
  const marks: NonNullable<JSONContent["marks"]> = []
  if (style.bold) marks.push({ type: "bold" })
  if (style.italic) marks.push({ type: "italic" })
  if (style.underline) marks.push({ type: "underline" })
  if (style.color)
    marks.push({ type: "textStyle", attrs: { color: style.color } })
  if (style.highlight)
    marks.push({ type: "highlight", attrs: { color: style.highlight } })
  return marks.length > 0 ? marks : undefined
}

export function styledSegmentsToTiptapContent(
  segments: StyledVerseSegment[]
): JSONContent {
  const text = segments.map((s) => s.text).join("")
  const allSpans = segments.flatMap((s) => s.spans ?? [])

  if (allSpans.length === 0) {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    }
  }

  const textNodes: JSONContent[] = []
  let cursor = 0

  const sorted = [...allSpans].sort((a, b) => a.start - b.start)
  for (const span of sorted) {
    if (span.start > cursor) {
      textNodes.push({ type: "text", text: text.slice(cursor, span.start) })
    }
    const node: JSONContent = {
      type: "text",
      text: text.slice(span.start, span.end),
    }
    const marks = inlineStyleToMarks(span.style)
    if (marks) node.marks = marks
    textNodes.push(node)
    cursor = span.end
  }

  if (cursor < text.length) {
    textNodes.push({ type: "text", text: text.slice(cursor) })
  }

  return {
    type: "doc",
    content: [{ type: "paragraph", content: textNodes }],
  }
}
