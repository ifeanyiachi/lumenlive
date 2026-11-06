/** Normalize and verify book 66 in the database staged for an app release. */
import { Database } from "bun:sqlite"
import { join, resolve } from "node:path"

const dbPath = resolve(
  process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ??
    join(import.meta.dir, "lumenlive.db")
)
const fix = process.argv.includes("--fix")
const db = fix ? new Database(dbPath) : new Database(dbPath, { readonly: true })

try {
  if (fix) {
    // Tauri bundles only the .db file, so keep all edits inside that file.
    db.query("PRAGMA journal_mode = DELETE").get()
    db.transaction(() => {
      db.exec(
        "UPDATE books SET name = 'Revelation' WHERE book_number = 66 AND name <> 'Revelation'"
      )
      db.exec(
        "UPDATE verses SET book_name = 'Revelation' WHERE book_number = 66 AND book_name <> 'Revelation'"
      )
    })()
  }

  const bookRows = db
    .query("SELECT COUNT(*) AS count FROM books WHERE book_number = 66")
    .get() as { count: number }
  const verseRows = db
    .query("SELECT COUNT(*) AS count FROM verses WHERE book_number = 66")
    .get() as { count: number }
  const incorrectBooks = db
    .query(
      "SELECT COUNT(*) AS count FROM books WHERE book_number = 66 AND name <> 'Revelation'"
    )
    .get() as { count: number }
  const incorrectVerses = db
    .query(
      "SELECT COUNT(*) AS count FROM verses WHERE book_number = 66 AND book_name <> 'Revelation'"
    )
    .get() as { count: number }

  if (
    !bookRows.count ||
    !verseRows.count ||
    incorrectBooks.count ||
    incorrectVerses.count
  ) {
    throw new Error(
      `Invalid Revelation data: ${bookRows.count} books, ${verseRows.count} verses, ` +
        `${incorrectBooks.count} incorrect book names, ${incorrectVerses.count} incorrect verse names`
    )
  }
  console.log(
    `Verified Revelation in ${dbPath}: ${bookRows.count} book row(s), ${verseRows.count} verses`
  )
} finally {
  db.close()
}
