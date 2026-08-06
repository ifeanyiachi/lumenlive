/**
 * Imports Hebrew/Greek interlinear word data and Strong's lexicon into lumenlive.db.
 *
 * Data sources (open source / public domain / CC BY):
 *   Lexicon:   github.com/openscriptures/strongs (.js files)
 *   Hebrew OT: github.com/openscriptures/morphhb  (OSHB XML, one file per OT book)
 *   Greek NT:  github.com/STEPBible/STEPBible-Data (TAGNT — 2 TSV files)
 *
 * Run: bun run setup:lexicon
 * Prereq: lumenlive.db must exist — run 'bun run build:bible' first.
 */

import { Database } from "bun:sqlite"
import { join } from "node:path"

const DATA_DIR = import.meta.dir
const DB_PATH = join(DATA_DIR, "lumenlive.db")

// ── Data source URLs ──────────────────────────────────────────────────────────

const STRONGS_HEB_URL =
  "https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js"
const STRONGS_GRK_URL =
  "https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js"

// STEPBible TAGNT — two files covering the full Greek NT (CC BY 4.0)
const TAGNT_BASE =
  "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Translators%20Amalgamated%20OT%2BNT"
const TAGNT_MAT_JHN_URL = `${TAGNT_BASE}/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt`
const TAGNT_ACT_REV_URL = `${TAGNT_BASE}/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt`

// OSHB XML — one file per OT book
const OSHB_BASE =
  "https://raw.githubusercontent.com/openscriptures/morphhb/master/wlc"
const OSHB_BOOKS: Array<[string, number]> = [
  ["Gen", 1],
  ["Exod", 2],
  ["Lev", 3],
  ["Num", 4],
  ["Deut", 5],
  ["Josh", 6],
  ["Judg", 7],
  ["Ruth", 8],
  ["1Sam", 9],
  ["2Sam", 10],
  ["1Kgs", 11],
  ["2Kgs", 12],
  ["1Chr", 13],
  ["2Chr", 14],
  ["Ezra", 15],
  ["Neh", 16],
  ["Esth", 17],
  ["Job", 18],
  ["Ps", 19],
  ["Prov", 20],
  ["Eccl", 21],
  ["Song", 22],
  ["Isa", 23],
  ["Jer", 24],
  ["Lam", 25],
  ["Ezek", 26],
  ["Dan", 27],
  ["Hos", 28],
  ["Joel", 29],
  ["Amos", 30],
  ["Obad", 31],
  ["Jonah", 32],
  ["Mic", 33],
  ["Nah", 34],
  ["Hab", 35],
  ["Zeph", 36],
  ["Hag", 37],
  ["Zech", 38],
  ["Mal", 39],
]

// STEPBible 3-letter book abbreviation → canonical book number (40–66 for NT)
const TAGNT_BOOK_NUM: Record<string, number> = {
  Mat: 40,
  Mrk: 41,
  Luk: 42,
  Jhn: 43,
  Act: 44,
  Rom: 45,
  "1Co": 46,
  "2Co": 47,
  Gal: 48,
  Eph: 49,
  Php: 50,
  Col: 51,
  "1Th": 52,
  "2Th": 53,
  "1Ti": 54,
  "2Ti": 55,
  Tit: 56,
  Phm: 57,
  Heb: 58,
  Jas: 59,
  "1Pe": 60,
  "2Pe": 61,
  "1Jn": 62,
  "2Jn": 63,
  "3Jn": 64,
  Jud: 65,
  Rev: 66,
}

// ── Normalisation helpers ─────────────────────────────────────────────────────

/** Strip leading zeros from a Strong's key: "G0976" → "G976", "H01" → "H1". */
function normKey(raw: string): string {
  return raw.replace(/^([HG])0+/i, (_, p) => p.toUpperCase())
}

/**
 * Extract the primary Strong's number from an OSHB lemma attribute.
 * Lemma format examples: "430", "c/559", "3588 a", "c/l/2822", "d/216"
 * Returns "H<num>" without leading zeros.
 */
function oshbStrong(lemma: string): string | null {
  // Strip prefix particles (one or more letter-sequences followed by '/')
  const stripped = lemma.replace(/^(?:[a-zA-Z]+\/)+/, "")
  const m = stripped.match(/^(\d+)/)
  if (!m) return null
  return `H${parseInt(m[1], 10)}`
}

/**
 * Extract the primary Strong's number from a TAGNT dStrong field.
 * Field format: "G0976=N-NSF" or "G2424G=N-GSM-P" or "H1732|G1138«G1138=N-GSM-P"
 * Prefers the G-prefixed number (Greek word, not OT name carrier).
 */
function tagntStrong(dStrongField: string): string | null {
  const part = dStrongField.split("=")[0]
  const gm = part.match(/G0*(\d+)/i)
  if (gm) return `G${parseInt(gm[1], 10)}`
  const hm = part.match(/H0*(\d+)/i)
  if (hm) return `H${parseInt(hm[1], 10)}`
  return null
}

// ── Network ───────────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  console.log(`  ↓  ${url.replace(/.*\//, "")}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.text()
}

// ── 1. Strong's lexicon ───────────────────────────────────────────────────────
//
// The .js files wrap JSON in a JS variable assignment:
//   var strongsHebrewDictionary = { "H1": {...}, ... };
// Extract by slicing from first '{' to last '}'.
//
// Hebrew fields: lemma, xlit (translit), pron (pronunciation), strongs_def, kjv_def
// Greek fields:  lemma, translit, strongs_def, kjv_def
// ─────────────────────────────────────────────────────────────────────────────
async function importLexicon(db: Database): Promise<void> {
  console.log("\n📚 Importing Strong's lexicon…")

  const ins = db.prepare(`
    INSERT OR IGNORE INTO strong_lexicon
      (strong_number, language, lemma, translit, pronunciation, definition, kjv_usage, derivation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const loadJs = (raw: string, lang: "hebrew" | "greek") => {
    const start = raw.indexOf("{")
    const end = raw.lastIndexOf("}")
    if (start === -1 || end === -1)
      throw new Error(`No JSON object found in ${lang} dictionary`)
    const dict = JSON.parse(raw.slice(start, end + 1)) as Record<
      string,
      Record<string, string>
    >

    db.transaction(() => {
      for (const [key, entry] of Object.entries(dict)) {
        const num = normKey(key)
        // Hebrew uses 'xlit' for transliteration + 'pron' for pronunciation
        // Greek uses 'translit' for transliteration (no separate pronunciation field)
        const translit = entry["xlit"] ?? entry["translit"] ?? null
        const pron = entry["pron"] ?? null
        // 'derivation' is the etymology / "Word Origin" (e.g. "from H7218")
        const derivation = entry["derivation"] ?? null
        ins.run(
          num,
          lang,
          entry["lemma"] ?? null,
          translit,
          pron,
          entry["strongs_def"] ?? null,
          entry["kjv_def"] ?? null,
          derivation
        )
      }
    })()
  }

  loadJs(await fetchText(STRONGS_HEB_URL), "hebrew")
  console.log("  ✓ Hebrew lexicon")
  loadJs(await fetchText(STRONGS_GRK_URL), "greek")
  console.log("  ✓ Greek lexicon")
}

// ── 2. Hebrew OT — OSHB (openscriptures/morphhb) ─────────────────────────────
//
// XML structure per verse:
//   <verse osisID="Gen.1.1">
//     <w lemma="c/559"  morph="HC/Vqw3ms" id="...">וַ/יֹּ֥אמֶר</w>
//     <w lemma="430"    morph="HNcmpa"    id="...">אֱלֹהִ֖ים</w>
//   </verse>
//
// lemma is numeric (no H prefix); may have prefix particles like "c/", "b/".
// ─────────────────────────────────────────────────────────────────────────────
function parseOshbXml(xml: string, bookNum: number) {
  const rows: Array<{
    book_number: number
    chapter: number
    verse: number
    position: number
    word: string
    strong_number: string | null
    morph: string | null
  }> = []

  const verseRe =
    /<verse\s+osisID="[^.]+\.(\d+)\.(\d+)"[^>]*>([\s\S]*?)<\/verse>/g
  let vm: RegExpExecArray | null
  while ((vm = verseRe.exec(xml)) !== null) {
    const chapter = parseInt(vm[1], 10)
    const verse = parseInt(vm[2], 10)
    const body = vm[3]

    const wordRe = /<w\b([^>]*)>([^<]*)<\/w>/g
    let wm: RegExpExecArray | null
    let pos = 1
    while ((wm = wordRe.exec(body)) !== null) {
      const attrs = wm[1]
      const word = wm[2].trim()
      if (!word) continue

      const lemmaM = attrs.match(/lemma="([^"]*)"/)
      const morphM = attrs.match(/morph="([^"]*)"/)
      const strong = lemmaM ? oshbStrong(lemmaM[1]) : null
      const morph = morphM ? morphM[1] : null

      rows.push({
        book_number: bookNum,
        chapter,
        verse,
        position: pos++,
        word,
        strong_number: strong,
        morph,
      })
    }
  }
  return rows
}

async function importHebrew(db: Database): Promise<void> {
  console.log("\n🔤 Importing Hebrew OT (OSHB)…")

  const ins = db.prepare(`
    INSERT OR IGNORE INTO original_words
      (book_number, chapter, verse, position, word, translit, strong_number, morph)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let total = 0
  for (const [bookName, bookNum] of OSHB_BOOKS) {
    const xml = await fetchText(`${OSHB_BASE}/${bookName}.xml`)
    const rows = parseOshbXml(xml, bookNum)
    db.transaction(() => {
      for (const r of rows)
        ins.run(
          r.book_number,
          r.chapter,
          r.verse,
          r.position,
          r.word,
          null,
          r.strong_number,
          r.morph
        )
    })()
    total += rows.length
    console.log(`  ✓ ${bookName} (${rows.length})`)
  }
  console.log(`  📖 Hebrew total: ${total} words`)
}

// ── 3. Greek NT — STEPBible TAGNT ────────────────────────────────────────────
//
// Two TSV files (Mat-Jhn, Act-Rev). Long header block of comment lines.
// Data rows have a # in the first field (the verse reference):
//
//   Mat.1.1#01=NKO  Βίβλος (Biblos)  [The] book  G0976=N-NSF  ...
//   Col 0           Col 1             Col 2        Col 3
//
// Col 0: "Book.Ch.Vs#WordNum=Type"
// Col 1: "GreekWord (Transliteration)"
// Col 3: "G####[suffix]=Grammar"   — may also start with H (OT name) or contain "|"
// ─────────────────────────────────────────────────────────────────────────────
function parseTagnt(tsv: string): Array<{
  book_number: number
  chapter: number
  verse: number
  position: number
  word: string
  translit: string | null
  strong_number: string | null
  morph: string | null
  gloss: string | null
}> {
  const rows: ReturnType<typeof parseTagnt> = []

  for (const line of tsv.split("\n")) {
    const cols = line.split("\t")
    const ref = cols[0]?.trim() ?? ""
    // Data rows contain '#' in the reference (e.g. "Mat.1.1#01=NKO")
    if (!ref.includes("#")) continue

    // Parse reference: "Mat.1.1#01=NKO"
    const hashIdx = ref.indexOf("#")
    const refPart = ref.slice(0, hashIdx) // "Mat.1.1"
    const wordPart = ref.slice(hashIdx + 1) // "01=NKO"
    const refParts = refPart.split(".")
    if (refParts.length < 3) continue

    const bookAbbr = refParts[0]
    const chapter = parseInt(refParts[1], 10)
    const verse = parseInt(refParts[2], 10)
    const position = parseInt(wordPart.split("=")[0], 10)
    const bookNum = TAGNT_BOOK_NUM[bookAbbr]

    if (!bookNum || isNaN(chapter) || isNaN(verse) || isNaN(position)) continue

    // Parse Greek + transliteration from col 1: "Βίβλος (Biblos)"
    const raw1 = cols[1]?.trim() ?? ""
    const parenIdx = raw1.lastIndexOf(" (")
    const word = parenIdx !== -1 ? raw1.slice(0, parenIdx).trim() : raw1
    const translit =
      parenIdx !== -1
        ? raw1
            .slice(parenIdx + 2)
            .replace(/\)$/, "")
            .trim()
        : null

    if (!word) continue

    // Parse English gloss from col 2: "[The] book" or "<the>" → "The book" / "the"
    // Strip brackets and trailing punctuation for clean matching
    const rawGloss = cols[2]?.trim() ?? ""
    const gloss = rawGloss
      ? rawGloss
          .replace(/[[\]<>]/g, "")
          .replace(/[.,;:!?]+$/, "")
          .trim() || null
      : null

    // Parse Strong's from col 3: "G0976=N-NSF"
    const dStrongCol = cols[3]?.trim() ?? ""
    const strong = tagntStrong(dStrongCol)
    const grammarM = dStrongCol.match(/=([A-Z0-9-]+)$/)
    const morph = grammarM ? grammarM[1] : null

    rows.push({
      book_number: bookNum,
      chapter,
      verse,
      position,
      word,
      translit: translit || null,
      strong_number: strong,
      morph,
      gloss,
    })
  }
  return rows
}

async function importGreek(db: Database): Promise<void> {
  console.log("\n🔤 Importing Greek NT (STEPBible TAGNT)…")

  const ins = db.prepare(`
    INSERT OR IGNORE INTO original_words
      (book_number, chapter, verse, position, word, translit, strong_number, morph, gloss)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  let total = 0
  for (const url of [TAGNT_MAT_JHN_URL, TAGNT_ACT_REV_URL]) {
    const tsv = await fetchText(url)
    const rows = parseTagnt(tsv)
    db.transaction(() => {
      for (const r of rows)
        ins.run(
          r.book_number,
          r.chapter,
          r.verse,
          r.position,
          r.word,
          r.translit,
          r.strong_number,
          r.morph,
          r.gloss
        )
    })()
    total += rows.length
    console.log(
      `  ✓ ${rows.length} words from ${url.match(/TAGNT%20([^%]+)/)?.[1].replace(/%20/g, " ")}`
    )
  }
  console.log(`  📖 Greek total: ${total} words`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔤 LumenLive Lexicon Builder\n")

  if (!(await Bun.file(DB_PATH).exists()))
    throw new Error(
      `lumenlive.db not found at ${DB_PATH}.\nRun 'bun run build:bible' first.`
    )

  const db = new Database(DB_PATH)
  db.exec("PRAGMA journal_mode=WAL;")

  db.exec(`
    DROP TABLE IF EXISTS original_words;
    CREATE TABLE original_words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_number INTEGER NOT NULL, chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL, position INTEGER NOT NULL,
      word TEXT NOT NULL, translit TEXT, strong_number TEXT, morph TEXT, gloss TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orig_words_verse
      ON original_words(book_number, chapter, verse);
    DROP TABLE IF EXISTS strong_lexicon;
    CREATE TABLE strong_lexicon (
      strong_number TEXT PRIMARY KEY, language TEXT NOT NULL,
      lemma TEXT, translit TEXT, pronunciation TEXT, definition TEXT, kjv_usage TEXT,
      derivation TEXT
    );
  `)

  await importLexicon(db)
  await importHebrew(db)
  await importGreek(db)

  db.close()
  console.log("\n✅ Lexicon import complete!\n")
}

main().catch((err) => {
  console.error("\n❌ Lexicon import failed:", err)
  process.exit(1)
})
