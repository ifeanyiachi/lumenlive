/**
 * Shared types for the Bible import pipeline.
 *
 * Parsing (txt/csv/.bib) happens here in `lib/` as pure functions over strings;
 * the resulting {@link ImportedVerse}[] is handed to the Rust `import_bible`
 * command, which builds a standalone SQLite `.db` and attaches it as a custom
 * translation. SQLite source files are read Rust-side instead (the webview
 * can't open a `.db`), so they never produce an `ImportedVerse[]` here.
 */

/** Testament partition — books 1–39 are OT, 40–66 are NT. */
export type Testament = "OT" | "NT"

/**
 * One canonical book of the Protestant 66-book canon. `number` is the stable
 * 1–66 ordinal the whole app keys on (matches `data/build-store-manifest.ts`).
 */
export interface CanonicalBook {
  number: number
  name: string
  abbreviation: string
  testament: Testament
  /** Lowercased alternate spellings/abbreviations that resolve to this book. */
  aliases: string[]
}

/**
 * A single parsed verse, in the minimal shape the Rust DB builder needs. The
 * book name/abbreviation are filled from the canonical table, not the source
 * file, so every imported translation shares one consistent book naming.
 */
export interface ImportedVerse {
  book_number: number
  chapter: number
  verse: number
  text: string
}

/** Metadata describing the translation being imported. */
export interface ImportMetadata {
  /** Short unique code, e.g. "NKJV". Becomes the translation abbreviation. */
  abbreviation: string
  /** Human title, e.g. "New King James Version". */
  title: string
  /** BCP-47-ish language tag, e.g. "en". */
  language: string
  /** Free-text license/attribution recorded with the install. */
  license: string
}

/** Result of parsing a text-based source file. */
export interface ParsedBible {
  verses: ImportedVerse[]
  /** Non-fatal issues (unrecognized book names, skipped lines, etc.). */
  warnings: string[]
}

/** File formats the importer understands. */
export type ImportFormat = "txt" | "csv" | "bib" | "sqlite" | "docx" | "pdf"

/** Formats parsed in JS (produce an `ImportedVerse[]` before hitting Rust). */
export const TEXT_FORMATS: ImportFormat[] = ["txt", "csv", "bib"]

/** Every extension the import file dialog offers, without the leading dot. */
export const IMPORT_EXTENSIONS: ImportFormat[] = [
  "txt",
  "csv",
  "bib",
  "sqlite",
  "docx",
  "pdf",
]

/** Map a file name to its {@link ImportFormat}, or `null` if unsupported. */
export function formatFromFileName(fileName: string): ImportFormat | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? ""
  switch (ext) {
    case "txt":
      return "txt"
    case "csv":
      return "csv"
    case "bib":
      return "bib"
    case "sqlite":
    case "db":
    case "sqlite3":
    case "bblx":
    case "mybible":
      return "sqlite"
    case "docx":
      return "docx"
    case "pdf":
      return "pdf"
    default:
      return null
  }
}
