import type { Song, SongSourceFormat } from "@/types/song"
import { buildSong, type ParsedSong } from "./normalize"
import { parsePlainText } from "./plain-text"
import { parseOpenLyrics } from "./openlyrics"
import { parseCcliTxt } from "./ccli-txt"
import { parseChordPro } from "./chordpro"
import { parseOpenSong } from "./opensong"
import { parseSongBeamer } from "./songbeamer"
import { parseCcliUsr } from "./ccli-usr"
import { parsePropresenter } from "./propresenter"
import { parseQuelea } from "./quelea"
import { parseOnsong } from "./onsong"

/** Formats the import engine can read (Phase 4 P0+P1, Phase 6 P2, Phase 7 P3). */
export type ImportableFormat =
  | "openlyrics"
  | "opensong"
  | "chordpro"
  | "onsong"
  | "ccli_txt"
  | "ccli_usr"
  | "songbeamer"
  | "propresenter"
  | "quelea"
  | "manual"

export {
  parsePlainText,
  parseOpenLyrics,
  parseCcliTxt,
  parseChordPro,
  parseOnsong,
  parseOpenSong,
  parseSongBeamer,
  parseCcliUsr,
  parsePropresenter,
  parseQuelea,
}
export type { ParsedSong }

const CHORDPRO_EXTS = new Set(["cho", "chordpro", "chopro", "crd", "pro"])

/**
 * Detect a song file's format from its filename extension and, failing that,
 * from a content sniff — so a `.txt` holding OpenLyrics XML or ChordPro still
 * routes correctly, and pasted text (no extension) is classified by content.
 */
export function detectSongFormat(name: string, text: string): ImportableFormat {
  const ext = name.toLowerCase().split(".").pop() ?? ""
  // Strip a leading BOM (U+FEFF) so the XML sniff anchors on the real first char.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const head = withoutBom.slice(0, 2000)

  if (
    ["pro4", "pro5", "pro6"].includes(ext) ||
    /<RVPresentationDocument\b/i.test(head)
  )
    return "propresenter"
  if (
    ext === "usr" ||
    /Type=SongSelect Import File/i.test(head) ||
    /^\[S\s/im.test(head)
  )
    return "ccli_usr"
  if (ext === "sng" || /^#(LangCount|Title)=/im.test(head)) return "songbeamer"
  if (ext === "onsong" || ext === "on") return "onsong"
  if (ext === "xml" || /^\s*<\?xml|<song[\s>]/i.test(head)) {
    // Distinguish the two XML dialects: OpenLyrics uses named verses; OpenSong
    // uses a single lyrics block with a <presentation> order.
    if (/openlyrics|<verse\s+name=/i.test(head)) return "openlyrics"
    if (/<presentation>|<lyrics>[\s\S]*\[/i.test(head)) return "opensong"
    return "openlyrics"
  }
  if (CHORDPRO_EXTS.has(ext)) return "chordpro"
  if (/\{\s*(title|t|start_of_verse|sov|start_of_chorus|soc)\b/i.test(head))
    return "chordpro"
  // OnSong: a `Key: value` metadata header plus colon-terminated section labels.
  if (
    /^(title|artist|key|tempo|flow|capo|ccli)\s*:/im.test(head) &&
    /^\s*(verse|chorus|bridge|pre[-\s]?chorus|intro|outro|ending|tag|interlude|instrumental|refrain|vamp|turnaround)\b[^:\n]*:\s*$/im.test(
      head
    )
  )
    return "onsong"
  if (/CCLI Song #/i.test(head)) return "ccli_txt"
  return "manual"
}

function parseByFormat(
  format: ImportableFormat,
  text: string,
  title: string
): ParsedSong {
  switch (format) {
    case "openlyrics":
      return parseOpenLyrics(text)
    case "opensong":
      return parseOpenSong(text)
    case "chordpro":
      return parseChordPro(text)
    case "onsong":
      return parseOnsong(text)
    case "ccli_txt":
      return parseCcliTxt(text)
    case "ccli_usr":
      return parseCcliUsr(text)
    case "songbeamer":
      return parseSongBeamer(text)
    case "propresenter":
      return parsePropresenter(text)
    case "quelea":
      return parseQuelea(text)
    default:
      return parsePlainText(text, title)
  }
}

/**
 * Import one song file's text into a normalised `Song`. `name` is the filename
 * (or a paste title) — its extension drives detection and its stem becomes the
 * fallback title when the content carries none. Returns `null` only if the text
 * is empty. `newId`/`now` are injectable for deterministic tests.
 */
export function importSongFromText(
  name: string,
  text: string,
  newId?: () => string,
  now?: number
): Song | null {
  if (!text.trim()) return null
  const stem = name.replace(/\.[^.]+$/, "").trim() || "Untitled Song"
  const format = detectSongFormat(name, text)
  const parsed = parseByFormat(format, text, stem)

  // Fall back to the filename stem when the format carried no usable title.
  if (!parsed.title || parsed.title === "Untitled Song") parsed.title = stem

  const sourceFormat: SongSourceFormat = format
  return buildSong(parsed, sourceFormat, newId, now)
}

/**
 * Import with an explicitly chosen format, bypassing auto-detection — used by the
 * "Import from…" menu for competitor formats (ProPresenter, Quelea) that share
 * ambiguous extensions/content with the open formats. Returns null for empty text.
 */
export function importSongAs(
  format: ImportableFormat,
  name: string,
  text: string,
  newId?: () => string,
  now?: number
): Song | null {
  if (!text.trim()) return null
  const stem = name.replace(/\.[^.]+$/, "").trim() || "Untitled Song"
  const parsed = parseByFormat(format, text, stem)
  if (!parsed.title || parsed.title === "Untitled Song") parsed.title = stem
  return buildSong(parsed, format, newId, now)
}
