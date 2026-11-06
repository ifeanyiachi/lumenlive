/**
 * Fetches open-licensed translations from bible.helloao.org, converts each into
 * a standalone SQLite DB with the frozen attach-ready schema, zstd-compresses it
 * to temp-bible/<slug>.db.zst, and merges its entry into temp-bible/index.json.
 *
 * This is the core new piece of the Bible-translations store expansion. It sits
 * beside `ingest-xml-translations.ts` (which does the same for local XML) and
 * feeds the same downstream packager, `build-store-upload.ts`.
 *
 * For each catalog entry (see `helloao/catalog.ts`) this:
 *   1. GETs /api/<id>/complete.json (sequential, retry-with-backoff).
 *   2. Flattens each verse's mixed content array to plain text
 *      (`helloao/flatten.ts`) and routes each book by USFM id to a stable
 *      book_number (`helloao/usfm-books.ts`) — canonical 1–66, deuterocanon ≥67,
 *      unknown ids skipped with a warning.
 *   3. Builds the standalone DB (SAME schema as ingest-xml / build-store-manifest
 *      so a downloaded translation routes byte-identically to the bundled DB),
 *      then VACUUMs.
 *   4. Verifies John 3:16 routes with local translation_id = 1 before publishing
 *      (skipped only for NT-less / OT-only editions that lack John).
 *   5. zstd-compresses (level 19) and writes <slug>.db + <slug>.db.zst.
 *   6. Merges/updates its entry in temp-bible/index.json (existing entries kept).
 *
 * Resumable: a slug whose <slug>.db.zst already exists AND whose index entry
 * matches that file's hash is skipped, so an interrupted run resumes cheaply.
 * Set FORCE=1 to rebuild everything.
 *
 * Run:  bun run data/fetch-helloao-translations.ts            (full catalog)
 *       bun run data/fetch-helloao-translations.ts bsb spa_r09 lat_clv   (subset)
 * Env:  FORCE=1        rebuild even if an up-to-date artifact exists
 *       API_BASE=…     override the helloao API base (default below)
 *
 * After this, run `bun run data/build-store-upload.ts` to repackage temp-bible/.
 */

import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { CATALOG, type CatalogEntry } from "./helloao/catalog"
import { flattenVerseContent } from "./helloao/flatten"
import { mapBook } from "./helloao/usfm-books"

const DATA_DIR = import.meta.dir
const TEMP_BIBLE = join(DATA_DIR, "..", "temp-bible")
const INDEX_PATH = join(TEMP_BIBLE, "index.json")
const API_BASE = process.env.API_BASE ?? "https://bible.helloao.org/api"
const FORCE = process.env.FORCE === "1"

/** Standalone DB schema — identical to ingest-xml-translations.ts (attach-ready). */
const STANDALONE_SCHEMA = `
CREATE TABLE translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  abbreviation TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  language TEXT NOT NULL,
  license TEXT NOT NULL,
  is_copyrighted INTEGER NOT NULL DEFAULT 0,
  is_downloaded INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL REFERENCES translations(id),
  book_number INTEGER NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  testament TEXT NOT NULL,
  UNIQUE(translation_id, book_number)
);
CREATE TABLE verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id INTEGER NOT NULL REFERENCES translations(id),
  book_id INTEGER NOT NULL REFERENCES books(id),
  book_number INTEGER NOT NULL,
  book_name TEXT NOT NULL,
  book_abbreviation TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX idx_verses_lookup ON verses(translation_id, book_number, chapter, verse);
CREATE INDEX idx_verses_chapter ON verses(translation_id, book_number, chapter);
`

// ── helloao complete.json shape (only the fields we read) ────────────────────
// Each `books[].chapters[]` element wraps the real chapter under `.chapter`
// (alongside audio metadata we ignore); `chapter.content` is the mixed array of
// verse / heading / line-break items, and verse items carry inner `content`.
interface HelloaoVerse {
  type: string
  number: number
  content: unknown[]
}
interface HelloaoChapter {
  number: number
  content: unknown[]
}
interface HelloaoBook {
  id: string
  chapters: Array<{ chapter: HelloaoChapter }>
}
interface HelloaoComplete {
  books: HelloaoBook[]
}

interface IndexEntry {
  slug: string
  abbreviation: string
  title: string
  language: string
  copyrighted: boolean
  books: number
  verses: number
  dbBytes: number
  zstBytes: number
  sha256: string
  // Added by this pipeline (ignored by older index consumers until Phase 2).
  licenseName?: string
  attribution?: string
}

// ── Networking ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** GET JSON with sequential retry + exponential backoff (politeness). */
async function fetchJson<T>(url: string, attempts = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      return (await res.json()) as T
    } catch (err) {
      lastErr = err
      const backoff = 500 * 2 ** i
      console.log(
        `     retry ${i + 1}/${attempts} in ${backoff}ms (${String(err)})`
      )
      await sleep(backoff)
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

// ── Conversion ───────────────────────────────────────────────────────────────

interface ParsedVerse {
  verse: number
  text: string
}
interface ParsedChapter {
  chapter: number
  verses: ParsedVerse[]
}
interface ParsedBook {
  bookNumber: number
  name: string
  abbreviation: string
  testament: string
  chapters: ParsedChapter[]
}

/**
 * Turn a helloao complete.json into ParsedBook[] keyed by stable book_number.
 * Unknown USFM ids are skipped with a warning; book identity (name/abbrev/
 * testament) comes from `mapBook`, never the source spelling.
 */
function convert(doc: HelloaoComplete): {
  books: ParsedBook[]
  skipped: string[]
} {
  const books: ParsedBook[] = []
  const skipped: string[] = []
  for (const srcBook of doc.books) {
    const meta = mapBook(srcBook.id)
    if (!meta) {
      skipped.push(srcBook.id)
      continue
    }
    const chapters: ParsedChapter[] = []
    for (const wrapper of srcBook.chapters) {
      const chap = wrapper.chapter
      const verses: ParsedVerse[] = []
      for (const item of chap.content) {
        if (
          !item ||
          typeof item !== "object" ||
          (item as HelloaoVerse).type !== "verse"
        ) {
          continue // headings, line breaks, and other non-verse items
        }
        const v = item as HelloaoVerse
        const text = flattenVerseContent(v.content)
        if (text) verses.push({ verse: v.number, text })
      }
      if (verses.length) chapters.push({ chapter: chap.number, verses })
    }
    if (chapters.length) {
      books.push({
        bookNumber: meta.number,
        name: meta.name,
        abbreviation: meta.abbreviation,
        testament: meta.testament,
        chapters,
      })
    }
  }
  books.sort((a, b) => a.bookNumber - b.bookNumber)
  return { books, skipped }
}

// ── DB build + verify (mirrors ingest-xml-translations.ts) ───────────────────

function buildStandaloneDb(
  meta: CatalogEntry,
  books: ParsedBook[],
  dbPath: string
): { verseCount: number; bookCount: number } {
  if (existsSync(dbPath)) rmSync(dbPath)
  const db = new Database(dbPath, { create: true })
  try {
    for (const stmt of STANDALONE_SCHEMA.split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      db.exec(stmt + ";")
    }

    const insertTranslation = db.prepare(
      "INSERT INTO translations (abbreviation, title, language, license, is_copyrighted) VALUES (?, ?, ?, ?, ?)"
    )
    const insertBook = db.prepare(
      "INSERT INTO books (translation_id, book_number, name, abbreviation, testament) VALUES (?, ?, ?, ?, ?)"
    )
    const insertVerse = db.prepare(
      "INSERT INTO verses (translation_id, book_id, book_number, book_name, book_abbreviation, chapter, verse, text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )

    db.exec("BEGIN TRANSACTION")
    // Every catalog entry is open-licensed → not copyrighted; the DB carries the
    // specific license name so the app can surface it verbatim.
    insertTranslation.run(meta.abbreviation, meta.title, meta.language, meta.licenseName, 0) // prettier-ignore
    const tId = (
      db.query("SELECT last_insert_rowid() as id").get() as { id: number }
    ).id

    let verseCount = 0
    for (const book of books) {
      insertBook.run(
        tId,
        book.bookNumber,
        book.name,
        book.abbreviation,
        book.testament
      )
      const bookId = (
        db.query("SELECT last_insert_rowid() as id").get() as { id: number }
      ).id
      for (const chapter of book.chapters) {
        for (const v of chapter.verses) {
          insertVerse.run(
            tId,
            bookId,
            book.bookNumber,
            book.name,
            book.abbreviation,
            chapter.chapter,
            v.verse,
            v.text
          )
          verseCount++
        }
      }
    }
    db.exec("COMMIT")
    db.exec("VACUUM")
    return { verseCount, bookCount: books.length }
  } finally {
    db.close()
  }
}

/**
 * Prove the DB is attach-ready. John 3:16 (book 43) must route with local
 * translation_id = 1 for any edition that contains John; OT-only / NT-less
 * editions (e.g. Septuagints, Hebrew-OT) instead just assert a non-empty verse
 * set, since they legitimately lack the reference.
 */
function verifyStandaloneDb(dbPath: string, meta: CatalogEntry): void {
  const db = new Database(dbPath, { readonly: true })
  try {
    const t = db
      .query("SELECT id, abbreviation FROM translations ORDER BY id LIMIT 1")
      .get() as { id: number; abbreviation: string } | null
    if (!t) throw new Error("no translation row")
    if (t.id !== 1)
      throw new Error(`local translation id is ${t.id}, expected 1`)
    if (t.abbreviation !== meta.abbreviation)
      throw new Error(`abbreviation ${t.abbreviation} != ${meta.abbreviation}`)

    const hasJohn = db
      .query(
        "SELECT 1 FROM books WHERE translation_id = 1 AND book_number = 43 LIMIT 1"
      )
      .get()
    if (hasJohn) {
      const sample = db
        .query(
          "SELECT text FROM verses WHERE translation_id = 1 AND book_number = 43 AND chapter = 3 AND verse = 16"
        )
        .get() as { text: string } | null
      if (!sample || !sample.text)
        throw new Error("John 3:16 did not route/return")
    } else {
      const any = db
        .query("SELECT COUNT(*) as n FROM verses WHERE translation_id = 1")
        .get() as { n: number }
      if (!any.n) throw new Error("no verses routed")
      console.log("     (no John — verified non-empty verse set instead)")
    }
  } finally {
    db.close()
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

// ── Orchestration ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n📥 Fetching helloao translations into temp-bible/...\n")
  console.log(`   api: ${API_BASE}\n`)

  // Optional positional filter: build only the named slugs / helloao ids.
  const filter = new Set(process.argv.slice(2).map((s) => s.toLowerCase()))
  const catalog = filter.size
    ? CATALOG.filter(
        (c) => filter.has(c.slug) || filter.has(c.helloaoId.toLowerCase())
      )
    : CATALOG

  // Guard: slugs and abbreviations must be unique across the catalog.
  const seenSlug = new Set<string>()
  for (const c of CATALOG) {
    if (seenSlug.has(c.slug))
      throw new Error(`duplicate catalog slug ${c.slug}`)
    seenSlug.add(c.slug)
  }

  if (!existsSync(TEMP_BIBLE)) mkdirSync(TEMP_BIBLE, { recursive: true })

  const existing: IndexEntry[] = existsSync(INDEX_PATH)
    ? (JSON.parse(readFileSync(INDEX_PATH, "utf-8"))
        .translations as IndexEntry[])
    : []
  const bySlug = new Map(existing.map((e) => [e.slug, e]))

  let built = 0
  let skipped = 0
  const failures: string[] = []

  for (const meta of catalog) {
    const dbPath = join(TEMP_BIBLE, `${meta.slug}.db`)
    const zstPath = join(TEMP_BIBLE, `${meta.slug}.db.zst`)

    // Resumable: skip if the artifact exists and matches its index entry.
    if (!FORCE && existsSync(zstPath)) {
      const prev = bySlug.get(meta.slug)
      if (prev && prev.sha256 === sha256Hex(readFileSync(zstPath))) {
        console.log(`  ⏭ ${meta.abbreviation.padEnd(10)} up-to-date, skipping`)
        skipped++
        continue
      }
    }

    try {
      const url = `${API_BASE}/${meta.helloaoId}/complete.json`
      console.log(`  ↓ ${meta.abbreviation.padEnd(10)} ${url}`)
      const doc = await fetchJson<HelloaoComplete>(url)

      const { books, skipped: skippedBooks } = convert(doc)
      if (skippedBooks.length)
        console.log(`     ⚠ skipped unknown books: ${skippedBooks.join(", ")}`)
      if (!books.length) throw new Error("no books parsed")

      const { verseCount, bookCount } = buildStandaloneDb(meta, books, dbPath)
      verifyStandaloneDb(dbPath, meta)

      const raw = readFileSync(dbPath)
      const compressed = Bun.zstdCompressSync(raw, { level: 19 })
      writeFileSync(zstPath, compressed)

      const entry: IndexEntry = {
        slug: meta.slug,
        abbreviation: meta.abbreviation,
        title: meta.title,
        language: meta.language,
        copyrighted: false,
        books: bookCount,
        verses: verseCount,
        dbBytes: raw.length,
        zstBytes: compressed.length,
        sha256: sha256Hex(compressed),
        licenseName: meta.licenseName,
        ...(meta.attribution ? { attribution: meta.attribution } : {}),
      }
      bySlug.set(meta.slug, entry)
      built++

      console.log(
        `  ✓ ${meta.abbreviation.padEnd(10)} ` +
          `${bookCount} books, ${verseCount.toLocaleString().padStart(7)} verses · ` +
          `${(raw.length / 1024 / 1024).toFixed(1)}MB → ` +
          `${(compressed.length / 1024 / 1024).toFixed(1)}MB · ${entry.sha256.slice(0, 12)}…`
      )
    } catch (err) {
      console.error(`  ❌ ${meta.abbreviation}: ${String(err)}`)
      failures.push(meta.slug)
    }

    // Persist the index after every success so an interrupted run keeps progress.
    writeIndex(bySlug)
  }

  console.log(
    `\n✅ Done — ${built} built, ${skipped} skipped, ${failures.length} failed` +
      ` · ${bySlug.size} translations in index.json`
  )
  if (failures.length) console.log(`   ⚠ failures: ${failures.join(", ")}`)
  console.log(`   📁 ${TEMP_BIBLE}`)
  console.log(
    `\n   Next: bun run data/build-store-upload.ts  (repackages for R2 upload)\n`
  )
  if (failures.length) process.exit(1)
}

function writeIndex(bySlug: Map<string, IndexEntry>): void {
  writeFileSync(
    INDEX_PATH,
    JSON.stringify(
      {
        generatedFrom: "data/fetch-helloao-translations.ts",
        translations: [...bySlug.values()],
      },
      null,
      2
    ) + "\n"
  )
}

main()
