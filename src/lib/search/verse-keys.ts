/**
 * Pure helpers for the two verse strings the search panel builds repeatedly:
 * the "already in queue" lookup key and the human-readable reference. Centralised
 * so the key format matches everywhere it is produced and compared.
 */

/** Location key used to dedupe against the queue: `book:chapter:verse`. */
export function verseLocationKey(
  bookNumber: number,
  chapter: number,
  verse: number
): string {
  return `${bookNumber}:${chapter}:${verse}`
}

/** Human-readable reference, e.g. `John 3:16`. */
export function verseReference(v: {
  book_name: string
  chapter: number
  verse: number
}): string {
  return `${v.book_name} ${v.chapter}:${v.verse}`
}
