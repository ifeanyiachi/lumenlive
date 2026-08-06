import { invoke } from "@tauri-apps/api/core"
import type { ImportedVerse, ImportMetadata } from "@/lib/bible-import"
import { IMPORT_EXTENSIONS } from "@/lib/bible-import"

/**
 * Gateway for importing a user-supplied Bible as a custom translation. Owns the
 * file-picker dialog, the (read-only) file read, and the two backend command
 * names — so the store never touches Tauri APIs directly.
 *
 * Two backend paths mirror the two producers: text formats (txt/csv/.bib) are
 * parsed in `lib/bible-import` and their verses sent to `import_bible_verses`;
 * a SQLite source is read entirely in Rust (the webview can't open a `.db`) via
 * `import_bible_sqlite`, which is handed only the file path.
 */

/** Extensions offered in the import dialog (sqlite aliases included). */
const DIALOG_EXTENSIONS = [
  ...IMPORT_EXTENSIONS,
  "db",
  "sqlite3",
  "bblx",
  "mybible",
]

/** Counts returned by the backend after a successful import. */
export interface ImportResult {
  globalId: number
  abbreviation: string
  title: string
  language: string
  verseCount: number
  bookCount: number
  /** Rows dropped for an out-of-range book number or bad reference. */
  skipped: number
}

/**
 * Open the native file picker for a Bible file. Resolves to the chosen absolute
 * path, or `null` if the user cancelled.
 */
export async function pickImportFile(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Bible files", extensions: DIALOG_EXTENSIONS }],
  })
  // `open` returns string | string[] | null depending on options.
  if (selected == null) return null
  return Array.isArray(selected) ? (selected[0] ?? null) : selected
}

/** Read a text-based source file (txt/csv/.bib) into a string. */
export async function readTextFile(path: string): Promise<string> {
  const { readTextFile: read } = await import("@tauri-apps/plugin-fs")
  return read(path)
}

/** Import verses parsed client-side (txt/csv/.bib). */
export function importVerses(
  metadata: ImportMetadata,
  verses: ImportedVerse[]
): Promise<ImportResult> {
  return invoke<ImportResult>("import_bible_verses", { metadata, verses })
}

/** Import a foreign SQLite Bible, read and parsed in Rust. */
export function importSqlite(
  metadata: ImportMetadata,
  sourcePath: string
): Promise<ImportResult> {
  return invoke<ImportResult>("import_bible_sqlite", { metadata, sourcePath })
}
