import type { Song } from "@/types/song"
import { importSongFromText } from "./index"
import { unzipTextEntries } from "./zip"

/**
 * Import a community song pack — a ZIP archive of song files fetched from a
 * public repo (GitHub/GitLab/Bitbucket) via `services/song-pack-gateway`. This
 * layer is pure: it unzips in-process (`unzipTextEntries`) and routes each entry
 * through the same auto-detecting importer the file/folder flows use, so every
 * supported text format (OnSong, ChordPro, OpenLyrics, OpenSong, CCLI, …) works
 * inside a pack with no per-format wiring.
 *
 * A GitHub archive nests everything under a `repo-branch/` top folder; the
 * extension filter is path-insensitive, so nesting doesn't matter. Non-song
 * files (READMEs, licenses, images, and binary `.qsp`/`.zip` sub-packs) are
 * skipped so a repo full of docs doesn't produce junk songs.
 */

/** Song *text* extensions recognised inside a pack (mirrors the file picker).
 * Binary sub-packs (`.qsp`/`.zip`) are intentionally excluded: `unzipTextEntries`
 * decodes entries as UTF-8, which would corrupt a nested archive. */
const SONG_EXTS = new Set([
  "xml",
  "txt",
  "cho",
  "chordpro",
  "chopro",
  "crd",
  "pro",
  "onsong",
  "on",
  "sng",
  "usr",
  "pro4",
  "pro5",
  "pro6",
])

/** Filenames (any casing/extension) that are never songs, only repo furniture. */
const SKIP_STEMS = new Set([
  "readme",
  "license",
  "licence",
  "contributing",
  "changelog",
  "authors",
  "notice",
  "copying",
  "codeowners",
])

function extOf(name: string): string {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? ""
  return base.includes(".") ? (base.split(".").pop() ?? "") : ""
}

function stemOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  return base.replace(/\.[^.]+$/, "").toLowerCase()
}

/** Whether a ZIP entry name should be parsed as a song text file. */
export function isPackSongEntry(name: string): boolean {
  if (name.endsWith("/")) return false
  if (SKIP_STEMS.has(stemOf(name))) return false
  return SONG_EXTS.has(extOf(name))
}

/**
 * Unzip `bytes` and import every song file inside, returning the normalised
 * songs (entries that fail to parse are skipped). `newId`/`now` are injectable so
 * a batch import can share an id sequence and clock.
 */
export async function importSongsFromPack(
  bytes: Uint8Array,
  newId?: () => string,
  now?: number
): Promise<Song[]> {
  const entries = await unzipTextEntries(bytes, isPackSongEntry)
  const songs: Song[] = []
  for (const entry of entries) {
    const song = importSongFromText(entry.name, entry.text, newId, now)
    if (song) songs.push(song)
  }
  return songs
}
