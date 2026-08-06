import type {
  Song,
  SongSection,
  SongSectionType,
  SongSourceFormat,
} from "@/types/song"

/**
 * Shared normalisation for all song importers. Each format parser produces a
 * plain `ParsedSong` (no ids, no timestamps); `buildSong` assigns fresh ids, a
 * default arrangement, and timestamps — keeping the parsers pure and letting one
 * place own the mapping to the app's `Song` type. `newId`/`now` are injectable
 * for deterministic tests.
 */

export interface ParsedSection {
  type?: SongSectionType
  label: string
  lyrics: string
  /** Raw format name (e.g. OpenLyrics verse `name="v1"`) used to resolve order. */
  name?: string
}

export interface ParsedSong {
  title: string
  authors?: string[]
  ccliNumber?: string
  copyright?: string
  publisher?: string
  year?: string
  key?: string
  themes?: string[]
  sections: ParsedSection[]
  /** Performance order referencing section `name`/`label` (OpenLyrics verseOrder). */
  verseOrder?: string[]
}

const uuid = () => crypto.randomUUID()

/** Best-effort section type from a label or a single-letter OpenLyrics code. */
export function inferSectionType(nameOrLabel: string): SongSectionType {
  const s = nameOrLabel.trim().toLowerCase()
  if (/pre[\s_-]*chorus/.test(s)) return "pre_chorus"
  if (/chorus|refrain/.test(s)) return "chorus"
  if (/bridge/.test(s)) return "bridge"
  if (/interlude/.test(s)) return "interlude"
  if (/intro/.test(s)) return "intro"
  if (/ending|outro/.test(s)) return "ending"
  if (/\btag\b|coda/.test(s)) return "tag"
  if (/vers/.test(s)) return "verse" // "verse" and the CCLI/German abbrev "vers"
  // OpenLyrics single-letter codes: v1, c, b2, p, i, e, o…
  const letter = s.match(/^([a-z])\d*$/)?.[1]
  switch (letter) {
    case "v":
      return "verse"
    case "c":
      return "chorus"
    case "b":
      return "bridge"
    case "p":
      return "pre_chorus"
    case "i":
      return "intro"
    case "e":
      return "ending"
    case "t":
      return "tag"
    default:
      return "custom"
  }
}

/** Human label for an OpenLyrics verse name (`v1` → "Verse 1", `c` → "Chorus"). */
export function labelFromVerseName(name: string): string {
  const m = name
    .trim()
    .toLowerCase()
    .match(/^([a-z])(\d*)$/)
  if (!m) return name.trim()
  const [, letter, num] = m
  const base: Record<string, string> = {
    v: "Verse",
    c: "Chorus",
    b: "Bridge",
    p: "Pre-Chorus",
    i: "Intro",
    e: "Ending",
    t: "Tag",
    o: "Section",
  }
  const word = base[letter] ?? "Section"
  return num ? `${word} ${num}` : word
}

/**
 * Assemble a full `Song` from a parsed result: fresh section ids, a single
 * default arrangement (honouring `verseOrder` when present, else all sections in
 * order), and normalised metadata. Always yields ≥1 section and exactly one
 * default arrangement.
 */
export function buildSong(
  parsed: ParsedSong,
  sourceFormat: SongSourceFormat,
  newId: () => string = uuid,
  now: number = Date.now()
): Song {
  const parsedSections =
    parsed.sections.length > 0
      ? parsed.sections
      : [{ label: "Verse 1", lyrics: "", type: "verse" as SongSectionType }]

  const sections: SongSection[] = parsedSections.map((s) => ({
    id: newId(),
    type: s.type ?? inferSectionType(s.label),
    label: s.label,
    lyrics: s.lyrics,
  }))

  // Map both the raw format name and the human label to the section id so a
  // verseOrder can reference either.
  const byKey = new Map<string, string>()
  parsedSections.forEach((s, i) => {
    if (s.name) byKey.set(s.name.trim().toLowerCase(), sections[i].id)
    byKey.set(s.label.trim().toLowerCase(), sections[i].id)
  })

  let sectionIds = sections.map((s) => s.id)
  if (parsed.verseOrder && parsed.verseOrder.length > 0) {
    const ordered = parsed.verseOrder
      .map((ref) => byKey.get(ref.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id))
    if (ordered.length > 0) sectionIds = ordered
  }

  return {
    id: newId(),
    title: parsed.title.trim() || "Untitled Song",
    authors: parsed.authors?.filter(Boolean) ?? [],
    copyright: parsed.copyright,
    ccliNumber: parsed.ccliNumber,
    publisher: parsed.publisher,
    year: parsed.year,
    key: parsed.key,
    themes: parsed.themes ?? [],
    primaryLang: "en",
    sections,
    arrangements: [
      { id: newId(), name: "Default", sectionIds, isDefault: true },
    ],
    sourceFormat,
    createdAt: now,
    updatedAt: now,
  }
}

// ── Shared plain-text helpers (used by plain-text and CCLI parsers) ──

/** A line that is exactly a section header, e.g. "Verse 1", "Chorus:", "BRIDGE". */
const HEADER_RE =
  /^(verse|chorus|bridge|pre[\s-]?chorus|intro|outro|ending|tag|interlude|refrain|coda)(\s*\d+)?:?$/i

export function isHeaderLine(line: string): boolean {
  return HEADER_RE.test(line.trim())
}

/** Normalise a header line to a clean Title-Case label ("verse 1" → "Verse 1"). */
export function normalizeHeaderLabel(line: string): string {
  return line
    .trim()
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Decode the common XML/HTML entities in imported text. */
export function decodeXmlEntities(s: string): string {
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&apos;": "'",
  }
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (m) => named[m] ?? m)
}
