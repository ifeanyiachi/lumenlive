// Helpers for the multi-verse editor, where several verses are edited together
// (one sub-editor per verse) and saved as independent per-verse edits. Kept pure
// so the save mapping is testable without React/TipTap.

import type { StyledVerseSegment, VerseEdit } from "@/types/verse-edit"

/**
 * Wrap a single edited verse segment into a {@link VerseEdit} for one verse.
 * Preserves an existing `createdAt` when re-saving; `now` is passed in (rather
 * than read from the clock) so callers control it and tests stay deterministic —
 * the store stamps the authoritative `updatedAt` on save.
 */
export function buildVerseEditFromSegment(params: {
  key: string
  reference: string
  originalText: string
  segment: StyledVerseSegment
  createdAt?: number
  now: number
}): VerseEdit {
  const { key, reference, originalText, segment, createdAt, now } = params
  return {
    key,
    reference,
    originalText,
    segments: [segment],
    createdAt: createdAt ?? now,
    updatedAt: now,
  }
}
