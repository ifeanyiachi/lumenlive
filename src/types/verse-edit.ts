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
