/**
 * Canonical 66-book table and a tolerant name/number resolver.
 *
 * Imported source files name books inconsistently ("Gen", "Genesis", "1 Cor",
 * "First Corinthians", "Psalm" vs "Psalms", "Song of Songs" vs "Song of
 * Solomon", or a bare 1–66 number). Every parser routes book identification
 * through {@link resolveBook} so an imported translation ends up with the same
 * numbering and display names as the bundled ones (see
 * `data/build-store-manifest.ts`), regardless of the source's spelling.
 */

import type { CanonicalBook } from "./types"

/**
 * The Protestant canon in order. `aliases` are lowercased and cover common
 * abbreviations and ordinal spellings ("1"/"i"/"first"). The full name,
 * abbreviation, and a compact no-space form are matched automatically by
 * {@link resolveBook}, so they need not be repeated here.
 */
export const CANONICAL_BOOKS: CanonicalBook[] = [
  {
    number: 1,
    name: "Genesis",
    abbreviation: "Gen",
    testament: "OT",
    aliases: ["gn"],
  },
  {
    number: 2,
    name: "Exodus",
    abbreviation: "Exod",
    testament: "OT",
    aliases: ["ex", "exo"],
  },
  {
    number: 3,
    name: "Leviticus",
    abbreviation: "Lev",
    testament: "OT",
    aliases: ["lv"],
  },
  {
    number: 4,
    name: "Numbers",
    abbreviation: "Num",
    testament: "OT",
    aliases: ["nm", "nb"],
  },
  {
    number: 5,
    name: "Deuteronomy",
    abbreviation: "Deut",
    testament: "OT",
    aliases: ["dt"],
  },
  {
    number: 6,
    name: "Joshua",
    abbreviation: "Josh",
    testament: "OT",
    aliases: ["jos", "jsh"],
  },
  {
    number: 7,
    name: "Judges",
    abbreviation: "Judg",
    testament: "OT",
    aliases: ["jdg", "jg"],
  },
  {
    number: 8,
    name: "Ruth",
    abbreviation: "Ruth",
    testament: "OT",
    aliases: ["rth", "ru"],
  },
  {
    number: 9,
    name: "1 Samuel",
    abbreviation: "1Sam",
    testament: "OT",
    aliases: ["1sm", "first samuel"],
  },
  {
    number: 10,
    name: "2 Samuel",
    abbreviation: "2Sam",
    testament: "OT",
    aliases: ["2sm", "second samuel"],
  },
  {
    number: 11,
    name: "1 Kings",
    abbreviation: "1Kgs",
    testament: "OT",
    aliases: ["1ki", "first kings"],
  },
  {
    number: 12,
    name: "2 Kings",
    abbreviation: "2Kgs",
    testament: "OT",
    aliases: ["2ki", "second kings"],
  },
  {
    number: 13,
    name: "1 Chronicles",
    abbreviation: "1Chr",
    testament: "OT",
    aliases: ["1ch", "first chronicles"],
  },
  {
    number: 14,
    name: "2 Chronicles",
    abbreviation: "2Chr",
    testament: "OT",
    aliases: ["2ch", "second chronicles"],
  },
  {
    number: 15,
    name: "Ezra",
    abbreviation: "Ezra",
    testament: "OT",
    aliases: ["ezr"],
  },
  {
    number: 16,
    name: "Nehemiah",
    abbreviation: "Neh",
    testament: "OT",
    aliases: ["ne"],
  },
  {
    number: 17,
    name: "Esther",
    abbreviation: "Esth",
    testament: "OT",
    aliases: ["est", "es"],
  },
  {
    number: 18,
    name: "Job",
    abbreviation: "Job",
    testament: "OT",
    aliases: ["jb"],
  },
  {
    number: 19,
    name: "Psalms",
    abbreviation: "Ps",
    testament: "OT",
    aliases: ["psalm", "psa", "pss", "plm"],
  },
  {
    number: 20,
    name: "Proverbs",
    abbreviation: "Prov",
    testament: "OT",
    aliases: ["pro", "prv", "pr"],
  },
  {
    number: 21,
    name: "Ecclesiastes",
    abbreviation: "Eccl",
    testament: "OT",
    aliases: ["ecc", "qoh", "ec"],
  },
  {
    number: 22,
    name: "Song of Solomon",
    abbreviation: "Song",
    testament: "OT",
    aliases: ["song of songs", "canticles", "sos", "sng", "so"],
  },
  {
    number: 23,
    name: "Isaiah",
    abbreviation: "Isa",
    testament: "OT",
    aliases: ["is"],
  },
  {
    number: 24,
    name: "Jeremiah",
    abbreviation: "Jer",
    testament: "OT",
    aliases: ["je", "jr"],
  },
  {
    number: 25,
    name: "Lamentations",
    abbreviation: "Lam",
    testament: "OT",
    aliases: ["la"],
  },
  {
    number: 26,
    name: "Ezekiel",
    abbreviation: "Ezek",
    testament: "OT",
    aliases: ["eze", "ezk"],
  },
  {
    number: 27,
    name: "Daniel",
    abbreviation: "Dan",
    testament: "OT",
    aliases: ["dn"],
  },
  {
    number: 28,
    name: "Hosea",
    abbreviation: "Hos",
    testament: "OT",
    aliases: ["ho"],
  },
  {
    number: 29,
    name: "Joel",
    abbreviation: "Joel",
    testament: "OT",
    aliases: ["jl"],
  },
  {
    number: 30,
    name: "Amos",
    abbreviation: "Amos",
    testament: "OT",
    aliases: ["am"],
  },
  {
    number: 31,
    name: "Obadiah",
    abbreviation: "Obad",
    testament: "OT",
    aliases: ["oba", "ob"],
  },
  {
    number: 32,
    name: "Jonah",
    abbreviation: "Jonah",
    testament: "OT",
    aliases: ["jon", "jnh"],
  },
  {
    number: 33,
    name: "Micah",
    abbreviation: "Mic",
    testament: "OT",
    aliases: ["mc"],
  },
  {
    number: 34,
    name: "Nahum",
    abbreviation: "Nah",
    testament: "OT",
    aliases: ["na"],
  },
  {
    number: 35,
    name: "Habakkuk",
    abbreviation: "Hab",
    testament: "OT",
    aliases: ["hb"],
  },
  {
    number: 36,
    name: "Zephaniah",
    abbreviation: "Zeph",
    testament: "OT",
    aliases: ["zep", "zph"],
  },
  {
    number: 37,
    name: "Haggai",
    abbreviation: "Hag",
    testament: "OT",
    aliases: ["hg"],
  },
  {
    number: 38,
    name: "Zechariah",
    abbreviation: "Zech",
    testament: "OT",
    aliases: ["zec", "zch"],
  },
  {
    number: 39,
    name: "Malachi",
    abbreviation: "Mal",
    testament: "OT",
    aliases: ["ml"],
  },
  {
    number: 40,
    name: "Matthew",
    abbreviation: "Matt",
    testament: "NT",
    aliases: ["mt"],
  },
  {
    number: 41,
    name: "Mark",
    abbreviation: "Mark",
    testament: "NT",
    aliases: ["mrk", "mk", "mr"],
  },
  {
    number: 42,
    name: "Luke",
    abbreviation: "Luke",
    testament: "NT",
    aliases: ["luk", "lk"],
  },
  {
    number: 43,
    name: "John",
    abbreviation: "John",
    testament: "NT",
    aliases: ["jhn", "jn"],
  },
  {
    number: 44,
    name: "Acts",
    abbreviation: "Acts",
    testament: "NT",
    aliases: ["act", "ac"],
  },
  {
    number: 45,
    name: "Romans",
    abbreviation: "Rom",
    testament: "NT",
    aliases: ["ro", "rm"],
  },
  {
    number: 46,
    name: "1 Corinthians",
    abbreviation: "1Cor",
    testament: "NT",
    aliases: ["1co", "first corinthians"],
  },
  {
    number: 47,
    name: "2 Corinthians",
    abbreviation: "2Cor",
    testament: "NT",
    aliases: ["2co", "second corinthians"],
  },
  {
    number: 48,
    name: "Galatians",
    abbreviation: "Gal",
    testament: "NT",
    aliases: ["ga"],
  },
  {
    number: 49,
    name: "Ephesians",
    abbreviation: "Eph",
    testament: "NT",
    aliases: ["ephes"],
  },
  {
    number: 50,
    name: "Philippians",
    abbreviation: "Phil",
    testament: "NT",
    aliases: ["php", "phil", "pp"],
  },
  {
    number: 51,
    name: "Colossians",
    abbreviation: "Col",
    testament: "NT",
    aliases: ["co"],
  },
  {
    number: 52,
    name: "1 Thessalonians",
    abbreviation: "1Thess",
    testament: "NT",
    aliases: ["1th", "1thes", "first thessalonians"],
  },
  {
    number: 53,
    name: "2 Thessalonians",
    abbreviation: "2Thess",
    testament: "NT",
    aliases: ["2th", "2thes", "second thessalonians"],
  },
  {
    number: 54,
    name: "1 Timothy",
    abbreviation: "1Tim",
    testament: "NT",
    aliases: ["1ti", "first timothy"],
  },
  {
    number: 55,
    name: "2 Timothy",
    abbreviation: "2Tim",
    testament: "NT",
    aliases: ["2ti", "second timothy"],
  },
  {
    number: 56,
    name: "Titus",
    abbreviation: "Titus",
    testament: "NT",
    aliases: ["tit", "ti"],
  },
  {
    number: 57,
    name: "Philemon",
    abbreviation: "Phlm",
    testament: "NT",
    aliases: ["phm", "philem", "pm"],
  },
  {
    number: 58,
    name: "Hebrews",
    abbreviation: "Heb",
    testament: "NT",
    aliases: ["hbr"],
  },
  {
    number: 59,
    name: "James",
    abbreviation: "Jas",
    testament: "NT",
    aliases: ["jam", "jm"],
  },
  {
    number: 60,
    name: "1 Peter",
    abbreviation: "1Pet",
    testament: "NT",
    aliases: ["1pe", "1pt", "first peter"],
  },
  {
    number: 61,
    name: "2 Peter",
    abbreviation: "2Pet",
    testament: "NT",
    aliases: ["2pe", "2pt", "second peter"],
  },
  {
    number: 62,
    name: "1 John",
    abbreviation: "1John",
    testament: "NT",
    aliases: ["1jn", "1jo", "first john"],
  },
  {
    number: 63,
    name: "2 John",
    abbreviation: "2John",
    testament: "NT",
    aliases: ["2jn", "2jo", "second john"],
  },
  {
    number: 64,
    name: "3 John",
    abbreviation: "3John",
    testament: "NT",
    aliases: ["3jn", "3jo", "third john"],
  },
  {
    number: 65,
    name: "Jude",
    abbreviation: "Jude",
    testament: "NT",
    aliases: ["jud", "jd"],
  },
  {
    number: 66,
    name: "Revelation",
    abbreviation: "Rev",
    testament: "NT",
    aliases: ["revelation of john", "apocalypse", "re", "rv"],
  },
]

/** Normalize a book token for matching: lowercase, collapse whitespace, and
 * canonicalize leading ordinals ("first"/"i"/"1st" → "1"). */
function normalizeKey(raw: string): string {
  let s = raw.trim().toLowerCase().replace(/\s+/g, " ")
  // Roman/word ordinals at the start → digits, so "II Kings" == "2 kings".
  s = s.replace(/^(1st|first|i)\b\.?/, "1")
  s = s.replace(/^(2nd|second|ii)\b\.?/, "2")
  s = s.replace(/^(3rd|third|iii)\b\.?/, "3")
  // Drop the space after a leading ordinal digit: "1 john" -> "1john".
  s = s.replace(/^([123])\s+/, "$1")
  return s
}

/** Lazily-built lookup from every normalized name/alias to its book. */
let index: Map<string, CanonicalBook> | null = null

function buildIndex(): Map<string, CanonicalBook> {
  const map = new Map<string, CanonicalBook>()
  const add = (key: string, book: CanonicalBook) => {
    const k = normalizeKey(key)
    if (k && !map.has(k)) map.set(k, book)
  }
  for (const book of CANONICAL_BOOKS) {
    add(book.name, book)
    add(book.abbreviation, book)
    // A no-space form of the full name ("songofsolomon", "1corinthians").
    add(book.name.replace(/\s+/g, ""), book)
    for (const alias of book.aliases) add(alias, book)
  }
  return map
}

/**
 * Resolve a book identifier — a name/abbreviation string or a 1–66 number — to
 * its canonical book. Returns `null` if nothing matches. Matching is
 * case-insensitive, whitespace- and ordinal-tolerant; abbreviations ending in a
 * period ("Gen.") are handled.
 */
export function resolveBook(identifier: string | number): CanonicalBook | null {
  if (typeof identifier === "number") {
    return CANONICAL_BOOKS[identifier - 1] ?? null
  }
  const trimmed = identifier.trim()
  if (trimmed === "") return null
  // A bare numeric string is a book number.
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed)
    return CANONICAL_BOOKS[n - 1] ?? null
  }
  if (!index) index = buildIndex()
  const key = normalizeKey(trimmed.replace(/\.$/, ""))
  return index.get(key) ?? null
}
