import Fuse from "fuse.js"
import type { Song } from "@/types/song"

/**
 * Fuzzy search over a song library — title, authors, and lyrics — mirroring the
 * Fuse configuration `src/lib/context-search.ts` uses for verses. Pure: given the
 * same songs and query it returns the same ordered subset, so the store and the
 * library grid can both call it and it is unit-testable.
 *
 * The index is rebuilt per call rather than cached: a song library is small (a
 * few hundred entries at most) and its contents change as the operator edits, so
 * the simplicity of a stateless function outweighs a stale-cache risk here.
 */
export function searchSongs(songs: Song[], query: string): Song[] {
  const q = query.trim()
  if (!q) return songs

  const fuse = new Fuse(songs, {
    shouldSort: true,
    threshold: 0.35,
    ignoreLocation: true,
    minMatchCharLength: 2,
    keys: [
      { name: "title", weight: 0.6 },
      { name: "authors", weight: 0.2 },
      {
        name: "lyrics",
        weight: 0.2,
        getFn: (song) => song.sections.map((s) => s.lyrics),
      },
    ],
  })

  return fuse.search(q).map((hit) => hit.item)
}
