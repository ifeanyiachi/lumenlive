import type { Song } from "@/types/song"
import type { LyricsContent } from "@/types/lyrics"
import {
  buildSong,
  inferSectionType,
  isHeaderLine,
  normalizeHeaderLabel,
  type ParsedSection,
  type ParsedSong,
} from "./normalize"

/**
 * Turn online lyrics (a flat block of text) into the app's `Song` shape, reusing
 * the same `ParsedSong` → `buildSong` pipeline as the file importers. Online
 * sources return lyrics as one blob; `splitLyricsIntoSections` recovers labelled
 * sections from explicit headers (`Chorus`, `[Verse 1]`) or, absent those, from
 * blank-line stanza breaks.
 */

/** A bracketed section header line, e.g. `[Verse 1]`, `[Chorus: Singer]`. */
const BRACKET_HEADER_RE = /^\[(.+?)\]$/

/** The section label for a line, or null when the line is ordinary lyrics. */
function headerLabel(line: string): string | null {
  const t = line.trim()
  const bracket = t.match(BRACKET_HEADER_RE)
  if (bracket) {
    // Drop a trailing performer annotation ("Verse 1: John" → "Verse 1").
    const inner = bracket[1].split(":")[0]
    return normalizeHeaderLabel(inner)
  }
  if (isHeaderLine(t)) return normalizeHeaderLabel(t)
  return null
}

/** Join a section body, trimming leading/trailing blank lines. */
function joinBody(lines: string[]): string {
  return lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "")
}

/** Split lyrics that carry explicit section headers into labelled sections. */
function splitByHeaders(lines: string[]): ParsedSection[] {
  const sections: ParsedSection[] = []
  let label = "Verse 1" // covers any lyrics appearing before the first header
  let body: string[] = []

  const flush = () => {
    const lyrics = joinBody(body)
    if (lyrics) sections.push({ label, type: inferSectionType(label), lyrics })
    body = []
  }

  for (const line of lines) {
    const header = headerLabel(line)
    if (header !== null) {
      flush()
      label = header
    } else {
      body.push(line)
    }
  }
  flush()
  return sections
}

/** Split header-less lyrics into one section per blank-line-separated stanza. */
function splitByBlankLines(text: string): ParsedSection[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((lyrics, i) => ({
      label: `Verse ${i + 1}`,
      type: "verse" as const,
      lyrics,
    }))
}

/** Parse a flat lyrics blob into labelled sections. */
export function splitLyricsIntoSections(raw: string): ParsedSection[] {
  const text = raw.replace(/\r\n?/g, "\n").trim()
  if (!text) return []
  const lines = text.split("\n")
  const hasHeaders = lines.some((l) => headerLabel(l) !== null)
  return hasHeaders ? splitByHeaders(lines) : splitByBlankLines(text)
}

/** Map resolved online lyrics to the parser-neutral `ParsedSong`. */
export function lyricsContentToParsedSong(content: LyricsContent): ParsedSong {
  const artist = content.artist.trim()
  return {
    title: content.title.trim() || "Untitled Song",
    authors: artist ? [artist] : [],
    sections: splitLyricsIntoSections(content.plainLyrics),
  }
}

/**
 * Build a library-ready `Song` from online lyrics. `newId`/`now` are injectable
 * for deterministic tests, matching the file importers.
 */
export function importOnlineSong(
  content: LyricsContent,
  newId?: () => string,
  now?: number
): Song {
  return buildSong(lyricsContentToParsedSong(content), "online", newId, now)
}
