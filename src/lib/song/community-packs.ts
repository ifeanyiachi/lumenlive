import type { Song } from "@/types/song"

/**
 * Curated community song packs for the Store's "Songs → Community" section.
 *
 * Each entry is a public repository the pack downloader (`song_fetch_pack` via
 * `services/song-pack-gateway`) knows how to fetch: its `url` is passed verbatim
 * to `fetchSongPack`, the returned ZIP is unzipped and parsed by the pure
 * `lib/song/import` layer (OnSong / ChordPro / OpenLyrics / OpenSong / CCLI are
 * auto-detected), and the resulting songs are stamped with this entry's `id` as
 * their `importBatchId` so a single click can install a whole pack and a single
 * click can remove it again.
 *
 * This is a hand-maintained list, not a live registry — the same repos users can
 * already paste into the "Community pack…" URL dialog, surfaced as one-click
 * cards. Keep it short and vetted; anyone can still install an arbitrary repo by
 * URL.
 *
 * Licensing note: many worship songs are under copyright. Installing a pack does
 * not grant a licence to project the lyrics — churches remain responsible for
 * their own CCLI (or equivalent) coverage. The public-domain hymn collections
 * below are the safe default.
 */
export interface CommunityPack {
  /** Stable id — also the `importBatchId` stamped on every song this pack adds. */
  id: string
  /** Display name of the pack. */
  name: string
  /** Repo owner / maintainer, shown as a byline. */
  author: string
  /** One-line description of what's inside. */
  description: string
  /** Public repo (or direct `.zip`) URL handed to `fetchSongPack`. */
  url: string
  /** Human-readable format(s) of the song files inside. */
  formats: string
  /** Primary language of the lyrics, for the metadata row. */
  language: string
  /** True for public-domain / permissively-licensed collections (safe default). */
  publicDomain?: boolean
  /** Highlight as a recommended starting point. */
  recommended?: boolean
}

/**
 * The vetted packs. Public-domain hymn collections lead; broad modern-worship
 * collections follow; niche-language songbooks last. All formats here are ones
 * `lib/song/import` already parses.
 */
export const COMMUNITY_PACKS: readonly CommunityPack[] = [
  {
    id: "openlyrics-hymns",
    name: "OpenLyrics Hymns",
    author: "openlyrics",
    description:
      "Public-domain hymns and reference songs from the OpenLyrics project — a clean, safe starter set.",
    url: "https://github.com/openlyrics/openlyrics",
    formats: "OpenLyrics",
    language: "English",
    publicDomain: true,
    recommended: true,
  },
  {
    id: "mattgraham-worship",
    name: "MattGraham Worship",
    author: "mattgraham",
    description:
      "A large community collection of modern worship songs and hymns in OnSong / ChordPro format.",
    url: "https://github.com/mattgraham/worship",
    formats: "OnSong / ChordPro",
    language: "English",
    recommended: true,
  },
]

/**
 * Tag every song in a freshly-imported batch with its pack of origin. Pure: it
 * returns new song objects (spread copies) and never mutates the inputs, so the
 * caller can hand the result straight to `addSongs`. `batchId` becomes each
 * song's `importBatchId` (used later by `removeSongsByBatch`) and `source` its
 * human-readable `importSource`.
 */
export function stampImportBatch(
  songs: Song[],
  batchId: string,
  source: string
): Song[] {
  return songs.map((song) => ({
    ...song,
    importBatchId: batchId,
    importSource: source,
  }))
}

/** A community pack currently present in the library (songs grouped by batch). */
export interface InstalledPack {
  /** The batch id every song in this pack shares (`Song.importBatchId`). For
   *  packs installed by URL this is the source URL, so it can be reinstalled. */
  batchId: string
  /** Display name — the batch's stored `importSource`, or a URL-derived label. */
  name: string
  /** How many songs from this pack are in the library. */
  count: number
  /** The curated catalog entry this batch came from, if any (else user-added). */
  pack?: CommunityPack
}

/**
 * Group the library's imported songs into the packs they came from — one entry
 * per distinct `importBatchId`, carrying the display name, song count, and the
 * matching curated `CommunityPack` when the batch is a known one. Songs with no
 * `importBatchId` (hand-made or single-file imports) are ignored: they aren't
 * packs. This is what lets the Store list *every* installed pack — curated or
 * pasted-by-URL — with an uninstall.
 */
export function installedPacks(
  songs: Song[],
  catalog: readonly CommunityPack[] = COMMUNITY_PACKS
): InstalledPack[] {
  const byId = new Map<string, InstalledPack>()
  for (const song of songs) {
    const batchId = song.importBatchId
    if (!batchId) continue
    const existing = byId.get(batchId)
    if (existing) {
      existing.count += 1
    } else {
      byId.set(batchId, {
        batchId,
        name: song.importSource ?? packLabelFromUrl(batchId),
        count: 1,
        pack: catalog.find((p) => p.id === batchId),
      })
    }
  }
  return [...byId.values()]
}

/**
 * A short, friendly label for a pack installed by URL: "owner/repo" for a
 * GitHub-style link, otherwise the host or the raw string. Used when a batch has
 * no stored `importSource` name to show.
 */
export function packLabelFromUrl(url: string): string {
  try {
    const { hostname, pathname } = new URL(url)
    const parts = pathname.split("/").filter(Boolean)
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
    if (parts.length === 1) return parts[0]
    return hostname
  } catch {
    return url
  }
}
