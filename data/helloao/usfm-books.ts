/**
 * USFM book-id → standalone-DB book identity.
 *
 * `book_number` is authoritative (not the source name), so book names and
 * abbreviations stay consistent across every translation regardless of how the
 * source spells them — the same rule `ingest-xml-translations.ts` follows.
 *
 *  - Canonical 66 (GEN=1 … REV=66): standard Protestant order, matching the
 *    bundled KJV so these books route across translations. `testament` is
 *    "OT" (≤39) / "NT" (≥40).
 *  - Deuterocanon / LXX (≥67): a fixed, documented order tagged "DC". These are
 *    reachable only within a translation that actually contains them; cross-
 *    translation nav simply never targets a book the active translation lacks.
 *    "DC" is a free-TEXT tag; no consumer switches exhaustively on OT/NT (grep
 *    of `crates/bible` + `src/` confirmed), so it degrades gracefully.
 *  - Unknown USFM id → `mapBook` returns `null` (caller skips + warns), so a
 *    stray/renamed book never fails the whole build.
 */

export interface BookMeta {
  number: number
  name: string
  abbreviation: string
  testament: "OT" | "NT" | "DC"
}

/** Canonical 66 in Protestant order: [usfmId, name, abbreviation]. */
const CANONICAL: ReadonlyArray<readonly [string, string, string]> = [
  ["GEN", "Genesis", "Gen"],
  ["EXO", "Exodus", "Exod"],
  ["LEV", "Leviticus", "Lev"],
  ["NUM", "Numbers", "Num"],
  ["DEU", "Deuteronomy", "Deut"],
  ["JOS", "Joshua", "Josh"],
  ["JDG", "Judges", "Judg"],
  ["RUT", "Ruth", "Ruth"],
  ["1SA", "1 Samuel", "1Sam"],
  ["2SA", "2 Samuel", "2Sam"],
  ["1KI", "1 Kings", "1Kgs"],
  ["2KI", "2 Kings", "2Kgs"],
  ["1CH", "1 Chronicles", "1Chr"],
  ["2CH", "2 Chronicles", "2Chr"],
  ["EZR", "Ezra", "Ezra"],
  ["NEH", "Nehemiah", "Neh"],
  ["EST", "Esther", "Esth"],
  ["JOB", "Job", "Job"],
  ["PSA", "Psalms", "Ps"],
  ["PRO", "Proverbs", "Prov"],
  ["ECC", "Ecclesiastes", "Eccl"],
  ["SNG", "Song of Solomon", "Song"],
  ["ISA", "Isaiah", "Isa"],
  ["JER", "Jeremiah", "Jer"],
  ["LAM", "Lamentations", "Lam"],
  ["EZK", "Ezekiel", "Ezek"],
  ["DAN", "Daniel", "Dan"],
  ["HOS", "Hosea", "Hos"],
  ["JOL", "Joel", "Joel"],
  ["AMO", "Amos", "Amos"],
  ["OBA", "Obadiah", "Obad"],
  ["JON", "Jonah", "Jonah"],
  ["MIC", "Micah", "Mic"],
  ["NAM", "Nahum", "Nah"],
  ["HAB", "Habakkuk", "Hab"],
  ["ZEP", "Zephaniah", "Zeph"],
  ["HAG", "Haggai", "Hag"],
  ["ZEC", "Zechariah", "Zech"],
  ["MAL", "Malachi", "Mal"],
  ["MAT", "Matthew", "Matt"],
  ["MRK", "Mark", "Mark"],
  ["LUK", "Luke", "Luke"],
  ["JHN", "John", "John"],
  ["ACT", "Acts", "Acts"],
  ["ROM", "Romans", "Rom"],
  ["1CO", "1 Corinthians", "1Cor"],
  ["2CO", "2 Corinthians", "2Cor"],
  ["GAL", "Galatians", "Gal"],
  ["EPH", "Ephesians", "Eph"],
  ["PHP", "Philippians", "Phil"],
  ["COL", "Colossians", "Col"],
  ["1TH", "1 Thessalonians", "1Thess"],
  ["2TH", "2 Thessalonians", "2Thess"],
  ["1TI", "1 Timothy", "1Tim"],
  ["2TI", "2 Timothy", "2Tim"],
  ["TIT", "Titus", "Titus"],
  ["PHM", "Philemon", "Phlm"],
  ["HEB", "Hebrews", "Heb"],
  ["JAS", "James", "Jas"],
  ["1PE", "1 Peter", "1Pet"],
  ["2PE", "2 Peter", "2Pet"],
  ["1JN", "1 John", "1John"],
  ["2JN", "2 John", "2John"],
  ["3JN", "3 John", "3John"],
  ["JUD", "Jude", "Jude"],
  ["REV", "Revelation", "Rev"],
]

/**
 * Deuterocanon / LXX in a fixed, documented order. Numbered 67+ (index + 67),
 * tagged "DC". Order is stable: never reorder or delete a row, only append —
 * a downloaded DB's book numbers must not shift under an installed base.
 */
const DEUTEROCANON: ReadonlyArray<readonly [string, string, string]> = [
  ["TOB", "Tobit", "Tob"],
  ["JDT", "Judith", "Jdt"],
  ["ESG", "Additions to Esther", "AddEsth"],
  ["WIS", "Wisdom of Solomon", "Wis"],
  ["SIR", "Sirach", "Sir"],
  ["BAR", "Baruch", "Bar"],
  ["LJE", "Letter of Jeremiah", "EpJer"],
  ["S3Y", "Prayer of Azariah", "PrAzar"],
  ["SUS", "Susanna", "Sus"],
  ["BEL", "Bel and the Dragon", "Bel"],
  ["1MA", "1 Maccabees", "1Macc"],
  ["2MA", "2 Maccabees", "2Macc"],
  ["3MA", "3 Maccabees", "3Macc"],
  ["4MA", "4 Maccabees", "4Macc"],
  ["1ES", "1 Esdras", "1Esd"],
  ["2ES", "2 Esdras", "2Esd"],
  ["MAN", "Prayer of Manasseh", "PrMan"],
  ["PS2", "Psalm 151", "Ps151"],
  ["ODA", "Odes", "Odes"],
  ["PSS", "Psalms of Solomon", "PssSol"],
  ["EZA", "Ezra Apocalypse (4 Ezra)", "4Ezra"],
  ["5EZ", "5 Ezra", "5Ezra"],
  ["6EZ", "6 Ezra", "6Ezra"],
]

/** usfmId (uppercased) → BookMeta. Frozen — the single source of truth. */
export const USFM_BOOKS: Readonly<Record<string, BookMeta>> = (() => {
  const map: Record<string, BookMeta> = {}
  CANONICAL.forEach(([usfm, name, abbreviation], i) => {
    const number = i + 1
    map[usfm] = {
      number,
      name,
      abbreviation,
      testament: number <= 39 ? "OT" : "NT",
    }
  })
  DEUTEROCANON.forEach(([usfm, name, abbreviation], i) => {
    map[usfm] = { number: 67 + i, name, abbreviation, testament: "DC" }
  })
  return map
})()

/**
 * Resolve a source USFM book id to its stable DB identity. Case-insensitive.
 * Returns `null` for an unknown id so the caller can skip + warn rather than
 * crash the build.
 */
export function mapBook(usfmId: string): BookMeta | null {
  return USFM_BOOKS[usfmId.trim().toUpperCase()] ?? null
}
