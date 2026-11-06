/**
 * Ingests raw XML Bible files into the temp-bible/ export that the store-upload
 * packager consumes.
 *
 * For each configured translation this:
 *   1. Parses the source XML — either the Zefania schema
 *      (<XMLBIBLE>/<BIBLEBOOK>/<CHAPTER>/<VERS>) or the alternate
 *      <bible>/<book>/<chapter>/<verse> schema — auto-detected per file.
 *   2. Builds a standalone SQLite <slug>.db using the SAME schema the attach
 *      layer reads (crates/bible/src/db.rs) — identical to build-store-manifest.ts
 *      so a downloaded translation routes byte-identically to the bundled DB.
 *   3. Verifies John 3:16 routes (local translation_id = 1) before publishing.
 *   4. zstd-compresses to <slug>.db.zst and writes BOTH files into temp-bible/.
 *   5. Merges/updates its entry in temp-bible/index.json (existing entries kept).
 *
 * After this, run `bun run data/build-store-upload.ts` to repackage
 * temp-bible/ into data/store-upload/bible-translations/ for R2 upload.
 *
 * Book identity comes from the numeric book index (1..66 = standard Protestant
 * order), NOT the file's book-name attribute, so names/abbreviations stay
 * consistent with every other translation regardless of source spelling.
 *
 * Run:  bun run data/ingest-xml-translations.ts
 * Env:  XML_DIR — folder holding the source XML files
 *       (default: C:/Users/M0906/Downloads/bible)
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

const DATA_DIR = import.meta.dir
const TEMP_BIBLE = join(DATA_DIR, "..", "temp-bible")
const INDEX_PATH = join(TEMP_BIBLE, "index.json")
const XML_DIR = process.env.XML_DIR ?? "C:/Users/M0906/Downloads/bible"

interface NewTranslation {
  slug: string
  abbreviation: string
  title: string
  language: string
  copyrighted: boolean
  /** File name inside XML_DIR. */
  file: string
}

/**
 * Only genuinely-new translations (not already built into temp-bible/). Slugs
 * and abbreviations must be unique and must not collide with the existing
 * entries: kjv, niv, esv, nasb, nkjv, nlt, amp, sparv, frejnd, porblivre.
 *
 * `copyrighted` is recorded truthfully. Whether copyrighted text is actually
 * hosted for redistribution is the operator's licensing decision — the
 * store-upload packager hosts everything in temp-bible/ regardless (see its
 * header). Trim entries here to change what gets ingested.
 */
const NEW_TRANSLATIONS: NewTranslation[] = [
  // ── Public domain ──
  {
    slug: "web",
    abbreviation: "WEB",
    title: "World English Bible",
    language: "en",
    copyrighted: false,
    file: "Bible_English_WEB.xml",
  },
  {
    slug: "bishops",
    abbreviation: "Bishops",
    title: "Bishops' Bible (1568)",
    language: "en",
    copyrighted: false,
    file: "Bible_English_Bishops.xml",
  },
  {
    slug: "cvb",
    abbreviation: "CVB",
    title: "Coverdale Bible (1535)",
    language: "en",
    copyrighted: false,
    file: "Bible_English_CVB.xml",
  },
  {
    slug: "dby",
    abbreviation: "DBY",
    title: "Darby Translation (1890)",
    language: "en",
    copyrighted: false,
    file: "Bible_English_DBY.xml",
  },

  // ── Copyrighted (flagged truthfully) ──
  {
    slug: "rsv",
    abbreviation: "RSV",
    title: "Revised Standard Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_RSV.xml",
  },
  {
    slug: "nrsv",
    abbreviation: "NRSV",
    title: "New Revised Standard Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_NRSV.xml",
  },
  {
    slug: "gnb",
    abbreviation: "GNB",
    title: "Good News Bible",
    language: "en",
    copyrighted: true,
    file: "Bible_English_GNB.xml",
  },
  {
    slug: "hcsb",
    abbreviation: "HCSB",
    title: "Holman Christian Standard Bible",
    language: "en",
    copyrighted: true,
    file: "Bible_English_HCSB.xml",
  },
  {
    slug: "ncv",
    abbreviation: "NCV",
    title: "New Century Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_NCV.xml",
  },
  {
    slug: "nlv",
    abbreviation: "NLV",
    title: "New Life Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_NLV.xml",
  },
  {
    slug: "kj21",
    abbreviation: "KJ21",
    title: "21st Century King James Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_KJ21.xml",
  },
  {
    slug: "mkjv",
    abbreviation: "MKJV",
    title: "Modern King James Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_MKJV.xml",
  },
  {
    slug: "tmb",
    abbreviation: "TMB",
    title: "Third Millennium Bible",
    language: "en",
    copyrighted: true,
    file: "Bible_English_TMB.xml",
  },
  {
    slug: "tniv",
    abbreviation: "TNIV",
    title: "Today's New International Version",
    language: "en",
    copyrighted: true,
    file: "Bible_English_TNIV.xml",
  },
  {
    slug: "msg",
    abbreviation: "MSG",
    title: "The Message",
    language: "en",
    copyrighted: true,
    file: "MSG.xml",
  },
  {
    slug: "nirv",
    abbreviation: "NIrV",
    title: "New International Reader's Version",
    language: "en",
    copyrighted: true,
    file: "NIRV.xml",
  },
]

// ── Canonical 66-book order → name/abbreviation (matches build-bible-db.ts). ──
const BOOKS: Array<{ name: string; abbrev: string }> = [
  { name: "Genesis", abbrev: "Gen" },
  { name: "Exodus", abbrev: "Exod" },
  { name: "Leviticus", abbrev: "Lev" },
  { name: "Numbers", abbrev: "Num" },
  { name: "Deuteronomy", abbrev: "Deut" },
  { name: "Joshua", abbrev: "Josh" },
  { name: "Judges", abbrev: "Judg" },
  { name: "Ruth", abbrev: "Ruth" },
  { name: "1 Samuel", abbrev: "1Sam" },
  { name: "2 Samuel", abbrev: "2Sam" },
  { name: "1 Kings", abbrev: "1Kgs" },
  { name: "2 Kings", abbrev: "2Kgs" },
  { name: "1 Chronicles", abbrev: "1Chr" },
  { name: "2 Chronicles", abbrev: "2Chr" },
  { name: "Ezra", abbrev: "Ezra" },
  { name: "Nehemiah", abbrev: "Neh" },
  { name: "Esther", abbrev: "Esth" },
  { name: "Job", abbrev: "Job" },
  { name: "Psalms", abbrev: "Ps" },
  { name: "Proverbs", abbrev: "Prov" },
  { name: "Ecclesiastes", abbrev: "Eccl" },
  { name: "Song of Solomon", abbrev: "Song" },
  { name: "Isaiah", abbrev: "Isa" },
  { name: "Jeremiah", abbrev: "Jer" },
  { name: "Lamentations", abbrev: "Lam" },
  { name: "Ezekiel", abbrev: "Ezek" },
  { name: "Daniel", abbrev: "Dan" },
  { name: "Hosea", abbrev: "Hos" },
  { name: "Joel", abbrev: "Joel" },
  { name: "Amos", abbrev: "Amos" },
  { name: "Obadiah", abbrev: "Obad" },
  { name: "Jonah", abbrev: "Jonah" },
  { name: "Micah", abbrev: "Mic" },
  { name: "Nahum", abbrev: "Nah" },
  { name: "Habakkuk", abbrev: "Hab" },
  { name: "Zephaniah", abbrev: "Zeph" },
  { name: "Haggai", abbrev: "Hag" },
  { name: "Zechariah", abbrev: "Zech" },
  { name: "Malachi", abbrev: "Mal" },
  { name: "Matthew", abbrev: "Matt" },
  { name: "Mark", abbrev: "Mark" },
  { name: "Luke", abbrev: "Luke" },
  { name: "John", abbrev: "John" },
  { name: "Acts", abbrev: "Acts" },
  { name: "Romans", abbrev: "Rom" },
  { name: "1 Corinthians", abbrev: "1Cor" },
  { name: "2 Corinthians", abbrev: "2Cor" },
  { name: "Galatians", abbrev: "Gal" },
  { name: "Ephesians", abbrev: "Eph" },
  { name: "Philippians", abbrev: "Phil" },
  { name: "Colossians", abbrev: "Col" },
  { name: "1 Thessalonians", abbrev: "1Thess" },
  { name: "2 Thessalonians", abbrev: "2Thess" },
  { name: "1 Timothy", abbrev: "1Tim" },
  { name: "2 Timothy", abbrev: "2Tim" },
  { name: "Titus", abbrev: "Titus" },
  { name: "Philemon", abbrev: "Phlm" },
  { name: "Hebrews", abbrev: "Heb" },
  { name: "James", abbrev: "Jas" },
  { name: "1 Peter", abbrev: "1Pet" },
  { name: "2 Peter", abbrev: "2Pet" },
  { name: "1 John", abbrev: "1John" },
  { name: "2 John", abbrev: "2John" },
  { name: "3 John", abbrev: "3John" },
  { name: "Jude", abbrev: "Jude" },
  { name: "Revelation", abbrev: "Rev" },
]

/** Standalone DB schema — identical to build-store-manifest.ts (attach-ready). */
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

interface ParsedVerse {
  verse: number
  text: string
}
interface ParsedChapter {
  chapter: number
  verses: ParsedVerse[]
}
/** book_number (1..66) → its chapters. */
type ParsedBook = { bookNumber: number; chapters: ParsedChapter[] }

// ── Text cleaning ────────────────────────────────────────────────────────────

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&") // last, so decoded output isn't re-decoded
}

/** Strip inline markup / study notes, decode entities, collapse whitespace. */
function cleanVerseText(raw: string): string {
  return decodeEntities(
    raw
      // drop study/footnote blocks and their content entirely
      .replace(/<NOTE\b[\s\S]*?<\/NOTE>/gi, " ")
      .replace(/<note\b[\s\S]*?<\/note>/g, " ")
      // any remaining tags → space (never merge adjacent words)
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
}

// ── XML parsing (dependency-free; the source structure is highly regular) ─────

/** Parse Zefania <XMLBIBLE> or alternate <bible> schema into ParsedBook[]. */
function parseXml(xml: string): ParsedBook[] {
  const isZefania = /<XMLBIBLE\b/i.test(xml)
  const bookRe = isZefania
    ? /<BIBLEBOOK\b[^>]*\bbnumber="(\d+)"[^>]*>([\s\S]*?)<\/BIBLEBOOK>/gi
    : /<book\b[^>]*\bnumber="(\d+)"[^>]*>([\s\S]*?)<\/book>/gi
  const chapRe = isZefania
    ? /<CHAPTER\b[^>]*\bcnumber="(\d+)"[^>]*>([\s\S]*?)<\/CHAPTER>/gi
    : /<chapter\b[^>]*\bnumber="(\d+)"[^>]*>([\s\S]*?)<\/chapter>/gi
  const verseRe = isZefania
    ? /<VERS\b[^>]*\bvnumber="(\d+)"[^>]*>([\s\S]*?)<\/VERS>/gi
    : /<verse\b[^>]*\bnumber="(\d+)"[^>]*>([\s\S]*?)<\/verse>/gi

  const books: ParsedBook[] = []
  for (const bm of xml.matchAll(bookRe)) {
    const bookNumber = parseInt(bm[1], 10)
    if (bookNumber < 1 || bookNumber > 66) continue // skip apocrypha/extras
    const chapters: ParsedChapter[] = []
    for (const cm of bm[2].matchAll(chapRe)) {
      const chapter = parseInt(cm[1], 10)
      const verses: ParsedVerse[] = []
      for (const vm of cm[2].matchAll(verseRe)) {
        const verse = parseInt(vm[1], 10)
        const text = cleanVerseText(vm[2])
        if (text) verses.push({ verse, text })
      }
      if (verses.length) chapters.push({ chapter, verses })
    }
    if (chapters.length) books.push({ bookNumber, chapters })
  }
  books.sort((a, b) => a.bookNumber - b.bookNumber)
  return books
}

// ── DB build + verify (mirrors build-store-manifest.ts) ──────────────────────

function buildStandaloneDb(
  meta: NewTranslation,
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
    insertTranslation.run(
      meta.abbreviation,
      meta.title,
      meta.language,
      meta.copyrighted ? "Copyrighted" : "Public Domain",
      meta.copyrighted ? 1 : 0
    )
    const tId = (
      db.query("SELECT last_insert_rowid() as id").get() as { id: number }
    ).id

    let verseCount = 0
    for (const book of books) {
      const info = BOOKS[book.bookNumber - 1]
      const testament = book.bookNumber <= 39 ? "OT" : "NT"
      insertBook.run(tId, book.bookNumber, info.name, info.abbrev, testament)
      const bookId = (
        db.query("SELECT last_insert_rowid() as id").get() as { id: number }
      ).id
      for (const chapter of book.chapters) {
        for (const v of chapter.verses) {
          insertVerse.run(
            tId,
            bookId,
            book.bookNumber,
            info.name,
            info.abbrev,
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

/** Prove the DB is attach-ready: John 3:16 routes with local translation_id=1. */
function verifyStandaloneDb(dbPath: string, meta: NewTranslation): void {
  const db = new Database(dbPath, { readonly: true })
  try {
    const t = db
      .query(
        "SELECT id, abbreviation, is_copyrighted FROM translations ORDER BY id LIMIT 1"
      )
      .get() as {
      id: number
      abbreviation: string
      is_copyrighted: number
    } | null
    if (!t) throw new Error("no translation row")
    if (t.id !== 1)
      throw new Error(`local translation id is ${t.id}, expected 1`)
    if (t.abbreviation !== meta.abbreviation)
      throw new Error(`abbreviation ${t.abbreviation} != ${meta.abbreviation}`)
    if (!!t.is_copyrighted !== meta.copyrighted)
      throw new Error("is_copyrighted mismatch")
    const sample = db
      .query(
        "SELECT text FROM verses WHERE translation_id = 1 AND book_number = 43 AND chapter = 3 AND verse = 16"
      )
      .get() as { text: string } | null
    if (!sample || !sample.text)
      throw new Error("John 3:16 did not route/return")
  } finally {
    db.close()
  }
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
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
}

function main() {
  console.log("\n📥 Ingesting XML translations into temp-bible/...\n")
  console.log(`   source: ${XML_DIR}\n`)

  if (!existsSync(TEMP_BIBLE)) mkdirSync(TEMP_BIBLE, { recursive: true })

  // Load existing index (the already-built 10) so we merge, not clobber.
  const existing: IndexEntry[] = existsSync(INDEX_PATH)
    ? (JSON.parse(readFileSync(INDEX_PATH, "utf-8"))
        .translations as IndexEntry[])
    : []
  const bySlug = new Map(existing.map((e) => [e.slug, e]))

  for (const meta of NEW_TRANSLATIONS) {
    const src = join(XML_DIR, meta.file)
    if (!existsSync(src)) {
      console.log(`  ⏭ ${meta.abbreviation}: ${meta.file} not found, skipping`)
      continue
    }

    const xml = readFileSync(src, "utf-8").replace(/^\uFEFF/, "")
    const books = parseXml(xml)
    if (books.length < 60) {
      console.error(
        `  ❌ ${meta.abbreviation}: parsed only ${books.length} books — check schema`
      )
      process.exit(1)
    }

    const dbPath = join(TEMP_BIBLE, `${meta.slug}.db`)
    const zstPath = join(TEMP_BIBLE, `${meta.slug}.db.zst`)

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
      copyrighted: meta.copyrighted,
      books: bookCount,
      verses: verseCount,
      dbBytes: raw.length,
      zstBytes: compressed.length,
      sha256: sha256Hex(compressed),
    }
    bySlug.set(meta.slug, entry)

    console.log(
      `  ${meta.copyrighted ? "🔒" : "  "} ${meta.abbreviation.padEnd(9)} ` +
        `${bookCount} books, ${verseCount.toLocaleString().padStart(7)} verses · ` +
        `${(raw.length / 1024 / 1024).toFixed(1)}MB → ` +
        `${(compressed.length / 1024 / 1024).toFixed(1)}MB · ${entry.sha256.slice(0, 12)}…`
    )
  }

  const translations = [...bySlug.values()]
  writeFileSync(
    INDEX_PATH,
    JSON.stringify(
      { generatedFrom: "data/ingest-xml-translations.ts", translations },
      null,
      2
    ) + "\n"
  )

  console.log(
    `\n✅ temp-bible/index.json updated — ${translations.length} translations total`
  )
  console.log(`   📁 ${TEMP_BIBLE}`)
  console.log(
    `\n   Next: bun run data/build-store-upload.ts  (repackages for R2 upload)\n`
  )
}

main()
