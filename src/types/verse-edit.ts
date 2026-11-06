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

/**
 * What a verse editor does when the operator commits an edit:
 * - `"schedule"` writes the edited verse(s) into the active schedule only;
 * - `"live"` pushes them straight to the audience only (never touches the schedule);
 * - `"both"` does both in one action.
 *
 * In the multi-verse editor's edit-in-place mode, `"schedule"` instead saves the
 * edits back onto the item being edited (see `MultiVerseEditModal.onSave`).
 */
export type CommitMode = "schedule" | "live" | "both"
