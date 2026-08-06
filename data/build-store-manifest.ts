/**
 * Builds the in-app resource-store artifacts for Bible translations:
 *
 *   store-artifacts/store/manifest.json          — the catalog the app fetches
 *   store-artifacts/store/bibles/<slug>.db.zst   — one standalone, zstd-compressed
 *                                                   SQLite DB per free translation
 *
 * Upload the whole `store-artifacts/store/` tree to the R2 bucket root so the
 * files land at `/store/manifest.json` and `/store/bibles/<slug>.db.zst` — the
 * exact paths the Rust downloader (`commands/resource_store.rs`) expects.
 *
 * Run: bun run data/build-store-manifest.ts
 * Prereq: bun run data/download-sources.ts  (populates data/sources/*.json)
 *
 * The manifest schema mirrors `src/lib/resource-store/manifest.ts` / the types in
 * `src/types/resource-store.ts` exactly — `sha256`/`bytes` describe the
 * COMPRESSED `.db.zst`, because that's what the Rust installer streams and
 * checksums before decompressing (see `store_install_bible`). Each standalone DB
 * uses the same `translations`/`books`/`verses` schema the attach layer reads
 * (`crates/bible/src/db.rs`), so an attached download routes byte-identically to
 * the bundled DB — the property `attached_routing_matches_main` already proves.
 *
 * Only free (public-domain / permissive) translations get a hosted file. The
 * copyrighted ones ship as `byo-import` placeholders with no download — LumenLive
 * never distributes their text; the app opens an "import a file you own" flow.
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
const SOURCES_DIR = join(DATA_DIR, "sources")
const OUT_ROOT = join(DATA_DIR, "store-artifacts")
const OUT_STORE = join(OUT_ROOT, "store")
const OUT_BIBLES = join(OUT_STORE, "bibles")

/** Manifest format version — must match `MANIFEST_VERSION` in the frontend. */
const MANIFEST_VERSION = 1
/** Per-resource data-schema version — must match `SUPPORTED_RESOURCE_SCHEMA`. */
const RESOURCE_SCHEMA_VERSION = 1
/** The R2 bucket root the artifacts are published under. */
const CDN_BASE = "https://pub-82480c48c8b84f8ca5162b8d42bd99d0.r2.dev"

type Distribution = "bundled-free" | "byo-import"

interface License {
  name: string
  copyrighted: boolean
  distribution: Distribution
  attribution?: string
}

interface StoreTranslation {
  /** Stable slug — the manifest id, file stem, and R2 key. */
  slug: string
  abbreviation: string
  title: string
  language: string
  license: License
  /** Source JSON in data/sources/. Required for `bundled-free`, unused for BYO. */
  sourceFile?: string
}

/**
 * The store catalog. Free entries build a hosted DB from their source JSON;
 * `byo-import` entries are placeholders (no file, no download fields).
 *
 * Only the free sources we actually have downloaded produce artifacts; the rest
 * are surfaced so users see the full version list they expect. Add real free
 * sources here (WEB, ASV, YLT, BBE, Segond 1910…) as their JSONs land in
 * data/sources/ — the pipeline needs no other change.
 */
const STORE_TRANSLATIONS: StoreTranslation[] = [
  // ── Free / public-domain (we host the file) ──
  {
    slug: "spa-rv1909",
    abbreviation: "SpaRV",
    title: "Reina-Valera 1909",
    language: "es",
    license: {
      name: "Public Domain",
      copyrighted: false,
      distribution: "bundled-free",
    },
    sourceFile: "SpaRV.json",
  },
  {
    slug: "fre-jnd1885",
    abbreviation: "FreJND",
    title: "J.N. Darby French 1885",
    language: "fr",
    license: {
      name: "Public Domain",
      copyrighted: false,
      distribution: "bundled-free",
    },
    sourceFile: "FreJND.json",
  },
  {
    slug: "por-blivre",
    abbreviation: "PorBLivre",
    title: "Bíblia Livre",
    language: "pt",
    license: {
      name: "Public Domain",
      copyrighted: false,
      distribution: "bundled-free",
    },
    sourceFile: "PorBLivre.json",
  },

  // ── Copyrighted (BYO import — never hosted) ──
  {
    slug: "niv",
    abbreviation: "NIV",
    title: "New International Version",
    language: "en",
    license: {
      name: "Biblica NIV License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "esv",
    abbreviation: "ESV",
    title: "English Standard Version",
    language: "en",
    license: {
      name: "Crossway ESV License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "nkjv",
    abbreviation: "NKJV",
    title: "New King James Version",
    language: "en",
    license: {
      name: "Thomas Nelson NKJV License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "nlt",
    abbreviation: "NLT",
    title: "New Living Translation",
    language: "en",
    license: {
      name: "Tyndale NLT License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "nasb",
    abbreviation: "NASB",
    title: "New American Standard Bible",
    language: "en",
    license: {
      name: "Lockman NASB License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "amp",
    abbreviation: "AMP",
    title: "Amplified Bible",
    language: "en",
    license: {
      name: "Lockman Amplified License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "msg",
    abbreviation: "MSG",
    title: "The Message",
    language: "en",
    license: {
      name: "NavPress Message License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
  {
    slug: "tpt",
    abbreviation: "TPT",
    title: "The Passion Translation",
    language: "en",
    license: {
      name: "BroadStreet TPT License",
      copyrighted: true,
      distribution: "byo-import",
    },
  },
]

// ── Book-name → abbreviation, shared with build-bible-db.ts ──
const BOOK_ABBREVS: Record<string, string> = {
  Genesis: "Gen",
  Exodus: "Exod",
  Leviticus: "Lev",
  Numbers: "Num",
  Deuteronomy: "Deut",
  Joshua: "Josh",
  Judges: "Judg",
  Ruth: "Ruth",
  "1 Samuel": "1Sam",
  "2 Samuel": "2Sam",
  "1 Kings": "1Kgs",
  "2 Kings": "2Kgs",
  "1 Chronicles": "1Chr",
  "2 Chronicles": "2Chr",
  Ezra: "Ezra",
  Nehemiah: "Neh",
  Esther: "Esth",
  Job: "Job",
  Psalms: "Ps",
  Proverbs: "Prov",
  Ecclesiastes: "Eccl",
  "Song of Solomon": "Song",
  Isaiah: "Isa",
  Jeremiah: "Jer",
  Lamentations: "Lam",
  Ezekiel: "Ezek",
  Daniel: "Dan",
  Hosea: "Hos",
  Joel: "Joel",
  Amos: "Amos",
  Obadiah: "Obad",
  Jonah: "Jonah",
  Micah: "Mic",
  Nahum: "Nah",
  Habakkuk: "Hab",
  Zephaniah: "Zeph",
  Haggai: "Hag",
  Zechariah: "Zech",
  Malachi: "Mal",
  Matthew: "Matt",
  Mark: "Mark",
  Luke: "Luke",
  John: "John",
  Acts: "Acts",
  Romans: "Rom",
  "1 Corinthians": "1Cor",
  "2 Corinthians": "2Cor",
  Galatians: "Gal",
  Ephesians: "Eph",
  Philippians: "Phil",
  Colossians: "Col",
  "1 Thessalonians": "1Thess",
  "2 Thessalonians": "2Thess",
  "1 Timothy": "1Tim",
  "2 Timothy": "2Tim",
  Titus: "Titus",
  Philemon: "Phlm",
  Hebrews: "Heb",
  James: "Jas",
  "1 Peter": "1Pet",
  "2 Peter": "2Pet",
  "1 John": "1John",
  "2 John": "2John",
  "3 John": "3John",
  Jude: "Jude",
  Revelation: "Rev",
}

interface ScrollmapperJSON {
  translation: { name?: string; abbreviation?: string }
  books: Array<{
    name: string
    chapters: Array<{
      chapter: number
      verses: Array<{ verse: number; text: string }>
    }>
  }>
}

/**
 * Schema for a standalone translation DB. Must stay identical to the tables the
 * attach layer reads (`crates/bible/src/db.rs`, `lookup.rs`) — the routed
 * queries select these exact columns. FTS/cross-refs/lexicon are intentionally
 * omitted: they live in the bundled DB and apply across every translation, and
 * attached translations fall back to LIKE search (see `search.rs`).
 */
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

interface BuildResult {
  verseCount: number
  bookCount: number
}

/** Build one standalone `.db` at `dbPath` from a scrollmapper source JSON. */
function buildStandaloneDb(
  meta: StoreTranslation,
  dbPath: string
): BuildResult {
  if (existsSync(dbPath)) rmSync(dbPath)
  const db = new Database(dbPath, { create: true })
  try {
    for (const stmt of STANDALONE_SCHEMA.split(";")
      .map((s) => s.trim())
      .filter(Boolean)) {
      db.exec(stmt + ";")
    }

    const source = join(SOURCES_DIR, meta.sourceFile as string)
    const data: ScrollmapperJSON = JSON.parse(readFileSync(source, "utf-8"))

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
      meta.license.name,
      meta.license.copyrighted ? 1 : 0
    )
    const tId = (
      db.query("SELECT last_insert_rowid() as id").get() as { id: number }
    ).id

    let verseCount = 0
    for (let i = 0; i < data.books.length; i++) {
      const book = data.books[i]
      const bookNumber = i + 1
      const abbrev = BOOK_ABBREVS[book.name] || book.name.substring(0, 4)
      const testament = bookNumber <= 39 ? "OT" : "NT"
      insertBook.run(tId, bookNumber, book.name, abbrev, testament)
      const bookId = (
        db.query("SELECT last_insert_rowid() as id").get() as { id: number }
      ).id
      for (const chapter of book.chapters) {
        for (const verse of chapter.verses) {
          insertVerse.run(
            tId,
            bookId,
            bookNumber,
            book.name,
            abbrev,
            chapter.chapter,
            verse.verse,
            verse.text
          )
          verseCount++
        }
      }
    }
    db.exec("COMMIT")
    db.exec("VACUUM")

    return { verseCount, bookCount: data.books.length }
  } finally {
    db.close()
  }
}

/**
 * Prove a generated DB is attach-ready before we publish it: open it read-only
 * and run the routed lookup the Rust layer runs (local translation_id = 1). A
 * bad schema or empty file fails here instead of at install time on a user's
 * machine.
 */
function verifyStandaloneDb(dbPath: string, meta: StoreTranslation): void {
  const db = new Database(dbPath, { readonly: true })
  try {
    const t = db
      .query(
        "SELECT id, abbreviation, title, language, is_copyrighted FROM translations ORDER BY id LIMIT 1"
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
    if (!!t.is_copyrighted !== meta.license.copyrighted)
      throw new Error("is_copyrighted mismatch")

    // The exact routed verse query shape from lookup.rs, with local_id = 1.
    const sample = db
      .query(
        "SELECT id, book_number, book_name, book_abbreviation, chapter, verse, text FROM verses WHERE translation_id = 1 AND book_number = 43 AND chapter = 3 AND verse = 16"
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

interface ManifestResource {
  kind: "bible"
  id: string
  title: string
  abbreviation: string
  language: string
  license: License
  schemaVersion: number
  url?: string
  sha256?: string
  bytes?: number
}

function main() {
  console.log("\n🏗  Building store manifest + translation artifacts...\n")

  rmSync(OUT_ROOT, { recursive: true, force: true })
  mkdirSync(OUT_BIBLES, { recursive: true })

  const resources: ManifestResource[] = []

  for (const meta of STORE_TRANSLATIONS) {
    const base: ManifestResource = {
      kind: "bible",
      id: meta.slug,
      title: meta.title,
      abbreviation: meta.abbreviation,
      language: meta.language,
      license: meta.license,
      schemaVersion: RESOURCE_SCHEMA_VERSION,
    }

    if (meta.license.distribution === "byo-import") {
      console.log(`  🔒 ${meta.abbreviation} — BYO import (no hosted file)`)
      resources.push(base)
      continue
    }

    // Free translation: build → verify → compress → hash.
    if (!meta.sourceFile || !existsSync(join(SOURCES_DIR, meta.sourceFile))) {
      console.log(
        `  ⏭ ${meta.abbreviation} — source ${meta.sourceFile} missing, skipping`
      )
      continue
    }

    const dbPath = join(OUT_BIBLES, `${meta.slug}.db`)
    const zstPath = join(OUT_BIBLES, `${meta.slug}.db.zst`)
    console.log(`  📖 ${meta.abbreviation} → ${meta.slug}.db.zst`)

    const { verseCount, bookCount } = buildStandaloneDb(meta, dbPath)
    verifyStandaloneDb(dbPath, meta)

    const raw = readFileSync(dbPath)
    const compressed = Bun.zstdCompressSync(raw, { level: 19 })
    writeFileSync(zstPath, compressed)
    rmSync(dbPath) // keep only the compressed artifact

    const sha256 = sha256Hex(compressed)
    const bytes = compressed.length
    console.log(
      `     ${bookCount} books, ${verseCount.toLocaleString()} verses · ` +
        `${(raw.length / 1024 / 1024).toFixed(1)} MB → ${(bytes / 1024 / 1024).toFixed(1)} MB · ${sha256.slice(0, 12)}…`
    )

    resources.push({
      ...base,
      url: `${CDN_BASE}/store/bibles/${meta.slug}.db.zst`,
      sha256,
      bytes,
    })
  }

  const manifest = {
    version: MANIFEST_VERSION,
    // Overridable so CI can pin a deterministic timestamp; else now.
    generatedAt:
      process.env.STORE_MANIFEST_TIMESTAMP ?? new Date().toISOString(),
    resources,
  }

  validateManifest(manifest)

  const manifestPath = join(OUT_STORE, "manifest.json")
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")

  const hosted = resources.filter((r) => r.url).length
  const byo = resources.length - hosted
  console.log(
    `\n✅ Wrote manifest.json — ${resources.length} resources (${hosted} hosted, ${byo} BYO)`
  )
  console.log(`   📁 ${OUT_STORE}`)
  console.log(
    `\n   Publish: upload the contents of ${OUT_STORE}/ to the R2 bucket root`
  )
  console.log(
    `   so they serve at ${CDN_BASE}/store/manifest.json and /store/bibles/*.db.zst\n`
  )
}

/**
 * Re-check the emitted manifest against the same rules the client's
 * `parseManifest` enforces, so a shape drift is caught at build time rather than
 * silently dropping entries on the client.
 */
function validateManifest(manifest: {
  version: number
  generatedAt: string
  resources: ManifestResource[]
}): void {
  if (manifest.version > MANIFEST_VERSION)
    throw new Error("manifest version too new")
  if (!manifest.generatedAt) throw new Error("missing generatedAt")
  const seen = new Set<string>()
  for (const r of manifest.resources) {
    const key = `${r.kind}:${r.id}`
    if (seen.has(key)) throw new Error(`duplicate resource ${key}`)
    seen.add(key)
    if (!r.id || !r.title || !r.abbreviation || !r.language)
      throw new Error(`incomplete ${key}`)
    if (r.schemaVersion > RESOURCE_SCHEMA_VERSION)
      throw new Error(`${key} schemaVersion too new`)
    const isFree = r.license.distribution === "bundled-free"
    const hasDownload =
      r.url !== undefined || r.sha256 !== undefined || r.bytes !== undefined
    if (isFree && !(r.url && r.sha256 && r.bytes))
      throw new Error(
        `${key} is free but missing a complete download descriptor`
      )
    if (!isFree && hasDownload)
      throw new Error(`${key} is byo-import but carries a download descriptor`)
  }
}

main()
