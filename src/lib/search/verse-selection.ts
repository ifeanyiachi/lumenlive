import type { Verse } from "@/types"

/**
 * Resolve which verse id in the freshly-loaded chapter should read as "selected".
 * After a translation change the chapter reloads with new verse ids, so a
 * selection by id may no longer exist — fall back to matching the previously
 * selected verse *number*. Pure: given the same inputs, same result.
 */
export function resolveEffectiveVerseId(
  currentChapter: Verse[],
  selectedVerseId: number | null,
  selectedVerse: Verse | null
): number | null {
  if (!selectedVerseId || currentChapter.length === 0) return null
  if (currentChapter.some((v) => v.id === selectedVerseId))
    return selectedVerseId
  if (!selectedVerse) return null
  return currentChapter.find((v) => v.verse === selectedVerse.verse)?.id ?? null
}
