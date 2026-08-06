/**
 * Parse a plain-text Bible export into verses.
 *
 * Handles the common "one verse per line, reference then text" layout, e.g.:
 *
 *   Genesis 1:1 In the beginning God created the heaven and the earth.
 *   John 3:16   For God so loved the world...
 *   1 John 4:8  He that loveth not knoweth not God...
 *
 * The reference may use `:` or `.` between chapter and verse, and the book may
 * carry a leading ordinal ("1 John", "II Kings"). Blank lines and lines that
 * don't start with a resolvable reference are skipped with a warning (so a
 * stray header or copyright line doesn't abort the whole import).
 */

import { resolveBook } from "./book-names"
import type { ImportedVerse, ParsedBible } from "./types"

/** `<book> <chapter>:<verse> <text>` — book is non-greedy so the first
 * `<num>:<num>` boundary wins even when the book name contains a digit. */
const LINE_RE = /^\s*(.+?)\s+(\d+)[:.](\d+)\s+(.+?)\s*$/

const MAX_WARNINGS = 50

export function parseTxt(content: string): ParsedBible {
  const verses: ImportedVerse[] = []
  const warnings: string[] = []
  let skipped = 0

  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === "") continue

    const match = LINE_RE.exec(line)
    if (!match) {
      skipped++
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(`Line ${i + 1}: no verse reference found, skipped`)
      }
      continue
    }

    const [, bookRaw, chapterRaw, verseRaw, text] = match
    const book = resolveBook(bookRaw)
    if (!book) {
      skipped++
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(
          `Line ${i + 1}: unknown book "${bookRaw.trim()}", skipped`
        )
      }
      continue
    }

    verses.push({
      book_number: book.number,
      chapter: Number(chapterRaw),
      verse: Number(verseRaw),
      text: text.trim(),
    })
  }

  if (skipped > MAX_WARNINGS) {
    warnings.push(`…and ${skipped - MAX_WARNINGS} more skipped line(s)`)
  }
  return { verses, warnings }
}
