import type { Book, Verse } from "@/types/bible"
import type { VerseRenderData } from "@/types/broadcast"

/**
 * Recover the first concrete verse identity from the committed live render.
 *
 * Voice navigation must use the audience-facing scripture as its anchor. The
 * Bible panel's selected verse/current chapter are browsing state and may lag
 * behind an async detection navigation or belong to a previous session.
 *
 * Render data intentionally carries a formatted reference rather than the
 * database identity, so resolve the canonical book name through the loaded
 * Bible book list. If the live content is missing or malformed, fail closed.
 */
export function liveVerseAnchor(
  liveVerse: VerseRenderData | null,
  books: Book[],
  translationId: number
): Verse | null {
  if (!liveVerse) return null

  const match = /^(.+?)\s+(\d+):/.exec(liveVerse.reference)
  if (!match) return null

  const bookName = match[1].trim()
  const chapter = Number(match[2])
  const segment = liveVerse.segments.find(
    (candidate) => candidate.verseNumber != null
  )
  const verse = segment?.verseNumber
  const book = books.find(
    (candidate) => candidate.name.toLowerCase() === bookName.toLowerCase()
  )

  if (!book || !Number.isInteger(chapter) || chapter < 1) return null
  if (verse == null || !Number.isInteger(verse) || verse < 1) return null

  return {
    id: 0,
    translation_id: translationId,
    book_number: book.book_number,
    book_name: book.name,
    book_abbreviation: book.abbreviation,
    chapter,
    verse,
    text: segment?.text ?? "",
  }
}
