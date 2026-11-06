/**
 * Parse a `.bib` Bible export into verses.
 *
 * `.bib` isn't one format, so two shapes are supported:
 *
 *  1. **Zefania XML** — `<XMLBIBLE>`/`<bible>` with
 *     `<BIBLEBOOK bnumber="1"><CHAPTER cnumber="1"><VERS vnumber="1">…</VERS>`.
 *     Detected by a leading `<`. Book is taken from `bnumber` (1–66) so it needs
 *     no name resolution; `bname` is ignored.
 *  2. **Delimited text** (Unbound-style) — one verse per line, tab/pipe/comma
 *     separated as `book, chapter, verse, text`, where the book column is a name
 *     or number resolved via {@link resolveBook}. Everything after the verse
 *     column folds into the text (tolerates trailing metadata columns).
 *
 * XML is extracted with regexes rather than a DOM parser so the module stays
 * pure and runs identically under Node/Vitest and the webview.
 */

import { resolveBook } from "./book-names"
import type { ImportedVerse, ParsedBible } from "./types"

const MAX_WARNINGS = 50

function parseZefania(content: string): ParsedBible {
  const verses: ImportedVerse[] = []
  const warnings: string[] = []

  const bookRe =
    /<BIBLEBOOK\b[^>]*\bbnumber\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/BIBLEBOOK>/gi
  const chapterRe =
    /<CHAPTER\b[^>]*\bcnumber\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/gi
  const verseRe =
    /<VERS\b[^>]*\bvnumber\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/VERS>/gi

  let bookMatch: RegExpExecArray | null
  while ((bookMatch = bookRe.exec(content))) {
    const bookNumber = Number(bookMatch[1])
    if (bookNumber < 1 || bookNumber > 66) {
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(`Book number ${bookNumber} out of range 1–66, skipped`)
      }
      continue
    }
    const bookBody = bookMatch[2]
    let chapterMatch: RegExpExecArray | null
    chapterRe.lastIndex = 0
    while ((chapterMatch = chapterRe.exec(bookBody))) {
      const chapter = Number(chapterMatch[1])
      const chapterBody = chapterMatch[2]
      let verseMatch: RegExpExecArray | null
      verseRe.lastIndex = 0
      while ((verseMatch = verseRe.exec(chapterBody))) {
        verses.push({
          book_number: bookNumber,
          chapter,
          verse: Number(verseMatch[1]),
          text: stripTags(verseMatch[2]),
        })
      }
    }
  }

  if (verses.length === 0) {
    warnings.push("No Zefania verses found — is this a valid XML Bible?")
  }
  return { verses, warnings }
}

/** Remove inline markup (notes, styling) and decode the few XML entities that
 * matter for plain verse text. */
function stripTags(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function parseDelimited(content: string): ParsedBible {
  const verses: ImportedVerse[] = []
  const warnings: string[] = []
  let skipped = 0

  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === "" || line.startsWith("#")) continue

    const delimiter = line.includes("\t")
      ? "\t"
      : line.includes("|")
        ? "|"
        : ","
    const fields = line.split(delimiter)
    if (fields.length < 4) {
      skipped++
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(
          `Line ${i + 1}: expected book/chapter/verse/text, skipped`
        )
      }
      continue
    }

    const book = resolveBook(fields[0].trim())
    const chapter = Number(fields[1].trim())
    const verse = Number(fields[2].trim())
    const text = fields.slice(3).join(delimiter).trim()
    if (!book || !Number.isInteger(chapter) || !Number.isInteger(verse)) {
      skipped++
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(`Line ${i + 1}: unparseable book/chapter/verse, skipped`)
      }
      continue
    }

    verses.push({ book_number: book.number, chapter, verse, text })
  }

  if (skipped > MAX_WARNINGS) {
    warnings.push(`…and ${skipped - MAX_WARNINGS} more skipped line(s)`)
  }
  return { verses, warnings }
}

export function parseBib(content: string): ParsedBible {
  return content.trimStart().startsWith("<")
    ? parseZefania(content)
    : parseDelimited(content)
}
