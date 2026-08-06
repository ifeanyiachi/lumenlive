import type { Song } from "@/types/song"
import { importSongAs } from "./index"
import { unzipTextEntries } from "./zip"

/**
 * Import a Quelea `.qsp` pack — a ZIP of individual song XML files. Unzips the
 * archive, parses each `.xml` entry as a Quelea song, and returns the normalised
 * songs (skipping any that fail to parse). `newId`/`now` are injectable so a
 * batch import can hand in a shared id sequence.
 */
export async function importSongsFromQsp(
  bytes: Uint8Array,
  newId?: () => string,
  now?: number
): Promise<Song[]> {
  const entries = await unzipTextEntries(bytes, (name) =>
    name.toLowerCase().endsWith(".xml")
  )
  const songs: Song[] = []
  for (const entry of entries) {
    const song = importSongAs("quelea", entry.name, entry.text, newId, now)
    if (song) songs.push(song)
  }
  return songs
}
