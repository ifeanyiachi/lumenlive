/**
 * Parse a CSV/TSV Bible export into verses.
 *
 * Column layout is auto-detected. If the first row is a header, columns are
 * matched by name (book/book_name/book_number, chapter, verse, text/scripture);
 * otherwise the positional default `book, chapter, verse, text` is assumed. The
 * book column may hold a name ("Genesis"), an abbreviation ("Gen"), or a 1–66
 * number. Delimiter is sniffed from comma / tab / semicolon.
 *
 * A small RFC 4180-style reader handles quoted fields containing the delimiter,
 * embedded newlines, and `""` escapes — so verse text with commas survives.
 */

import { resolveBook } from "./book-names"
import type { ImportedVerse, ParsedBible } from "./types"

const MAX_WARNINGS = 50

/** Split CSV text into rows of fields, honoring quotes and escaped quotes. */
function parseRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const c = content[i]
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === delimiter) {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      field = ""
      row = []
    } else if (c === "\r") {
      // handled by the \n branch; ignore bare CR
    } else {
      field += c
    }
  }
  // Flush the trailing field/row if the file didn't end with a newline.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Pick the delimiter that yields the most columns on the first line. */
function sniffDelimiter(content: string): string {
  const firstLine = content.slice(
    0,
    content.indexOf("\n") + 1 || content.length
  )
  const candidates = [",", "\t", ";"]
  let best = ","
  let bestCount = -1
  for (const d of candidates) {
    const count = firstLine.split(d).length
    if (count > bestCount) {
      bestCount = count
      best = d
    }
  }
  return best
}

interface ColumnMap {
  book: number
  chapter: number
  verse: number
  text: number
}

/** Match header cells to columns; returns `null` if the row isn't a header. */
function detectHeader(cells: string[]): ColumnMap | null {
  const norm = cells.map((c) => c.trim().toLowerCase())
  const find = (names: string[]) => norm.findIndex((c) => names.includes(c))

  const book = find([
    "book",
    "book_name",
    "bookname",
    "book_number",
    "booknum",
    "b",
  ])
  const chapter = find(["chapter", "chap", "c"])
  const verse = find(["verse", "v"])
  const text = find(["text", "scripture", "verse_text", "content", "t"])

  if (book >= 0 && chapter >= 0 && verse >= 0 && text >= 0) {
    return { book, chapter, verse, text }
  }
  return null
}

export function parseCsv(content: string): ParsedBible {
  const verses: ImportedVerse[] = []
  const warnings: string[] = []

  const delimiter = sniffDelimiter(content)
  const rows = parseRows(content, delimiter).filter(
    (r) => r.length > 0 && !(r.length === 1 && r[0].trim() === "")
  )
  if (rows.length === 0) return { verses, warnings }

  const header = detectHeader(rows[0])
  const cols: ColumnMap = header ?? { book: 0, chapter: 1, verse: 2, text: 3 }
  const dataRows = header ? rows.slice(1) : rows

  let skipped = 0
  for (let i = 0; i < dataRows.length; i++) {
    const cells = dataRows[i]
    const rowNum = i + (header ? 2 : 1)
    const bookRaw = cells[cols.book]?.trim() ?? ""
    const chapterRaw = cells[cols.chapter]?.trim() ?? ""
    const verseRaw = cells[cols.verse]?.trim() ?? ""
    const text = cells[cols.text] ?? ""

    const book = resolveBook(bookRaw)
    const chapter = Number(chapterRaw)
    const verse = Number(verseRaw)
    if (
      !book ||
      !Number.isInteger(chapter) ||
      !Number.isInteger(verse) ||
      chapter < 1 ||
      verse < 1
    ) {
      skipped++
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(`Row ${rowNum}: unparseable book/chapter/verse, skipped`)
      }
      continue
    }

    verses.push({
      book_number: book.number,
      chapter,
      verse,
      text: text.trim(),
    })
  }

  if (skipped > MAX_WARNINGS) {
    warnings.push(`…and ${skipped - MAX_WARNINGS} more skipped row(s)`)
  }
  return { verses, warnings }
}
