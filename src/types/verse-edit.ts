import type { VerseSegment } from "./broadcast"

export interface InlineStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string
  highlight?: string
}

export interface StyledSpan {
  start: number
  end: number
  style: InlineStyle
}

export interface StyledVerseSegment extends VerseSegment {
  spans?: StyledSpan[]
}

export interface VerseEdit {
  key: string
  reference: string
  originalText: string
  segments: StyledVerseSegment[]
  createdAt: number
  updatedAt: number
}

export function verseEditKey(
  translationId: number,
  bookNumber: number,
  chapter: number,
  verse: number
): string {
  return `${translationId}:${bookNumber}:${chapter}:${verse}`
}
