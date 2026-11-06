/**
 * Bible import — pure parsing layer.
 *
 * Turns a text-based source file (txt / csv / .bib) into an `ImportedVerse[]`
 * ready for the Rust `import_bible` command, which builds a standalone SQLite
 * translation from it. SQLite/docx/pdf sources are NOT parsed here: `.sqlite`
 * is read directly Rust-side (the webview can't open a DB), and docx/pdf are
 * not yet supported. Use {@link parseBibleFile} as the single entry point.
 */

export * from "./types"
export { CANONICAL_BOOKS, resolveBook } from "./book-names"
export { parseTxt } from "./parse-txt"
export { parseCsv } from "./parse-csv"
export { parseBib } from "./parse-bib"
export { deriveMetaFromFileName } from "./filename-meta"

import { parseTxt } from "./parse-txt"
import { parseCsv } from "./parse-csv"
import { parseBib } from "./parse-bib"
import { formatFromFileName } from "./types"
import type { ParsedBible } from "./types"

/** Raised when a file's format has no in-JS parser (sqlite/docx/pdf/unknown). */
export class UnsupportedTextFormatError extends Error {
  readonly fileName: string
  constructor(fileName: string) {
    super(
      `"${fileName}" is not a text-parseable Bible format. ` +
        `Only .txt, .csv and .bib are parsed in-app; .sqlite is handled ` +
        `separately, and .docx/.pdf are not yet supported.`
    )
    this.name = "UnsupportedTextFormatError"
    this.fileName = fileName
  }
}

/**
 * Parse a text-based Bible file by extension. Throws
 * {@link UnsupportedTextFormatError} for sqlite/docx/pdf/unknown — callers
 * route `.sqlite` to the Rust importer and should surface docx/pdf as
 * "not yet supported".
 */
export function parseBibleFile(fileName: string, content: string): ParsedBible {
  const format = formatFromFileName(fileName)
  switch (format) {
    case "txt":
      return parseTxt(content)
    case "csv":
      return parseCsv(content)
    case "bib":
      return parseBib(content)
    default:
      throw new UnsupportedTextFormatError(fileName)
  }
}
