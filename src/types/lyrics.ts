/**
 * Online lyrics search — wire types shared by the search gateway and the online
 * importer. Pure (no runtime imports), mirroring the Rust `lumenlive-lyrics`
 * model (serde `camelCase`). Kept here in `types/` so `lib/song/import` can use
 * them without depending on the Tauri gateway.
 */

/** A lightweight search result from one online provider. */
export interface LyricsHit {
  /** Provider id that produced the hit ("lrclib", "genius", …). */
  source: string
  title: string
  artist: string
  album?: string
  durationSec?: number
  /** Provider handle the fetch step resolves (a URL for scrapers, id for APIs). */
  reference: string
  hasSynced: boolean
  /** Lyrics already carried by the search response (LRCLIB), if any. */
  plainLyrics?: string
  syncedLyrics?: string
  thumbnailUrl?: string
}

/** Full resolved lyrics for one hit, normalised across providers. */
export interface LyricsContent {
  source: string
  title: string
  artist: string
  album?: string
  plainLyrics: string
  syncedLyrics?: string
  sourceUrl?: string
}

/** One provider's failure during a fan-out search. */
export interface LyricsProviderFailure {
  source: string
  message: string
}

/** Aggregated fan-out result: hits plus per-source failures. */
export interface LyricsSearchResponse {
  hits: LyricsHit[]
  errors: LyricsProviderFailure[]
}
