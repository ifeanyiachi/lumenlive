import { invoke } from "@tauri-apps/api/core"
import type {
  LyricsContent,
  LyricsHit,
  LyricsSearchResponse,
} from "@/types/lyrics"

/**
 * Gateway for online lyrics search. Owns the backend command names for the
 * `lumenlive-lyrics` crate so the rest of the app never invokes them directly.
 * All HTTP + scraping runs in Rust (bypassing the webview CSP); this module is
 * just the typed IPC boundary — the sibling of `resource-store-gateway.ts`.
 */

/**
 * Search online providers for `query` (by title, artist, or a lyric line).
 * Resolves with partial results — a provider that failed or timed out appears in
 * `errors`, not as a rejection. `sources` optionally restricts to a subset of
 * provider ids; `geniusToken` is the Genius access key from Songs settings
 * (Genius is skipped when it's absent).
 */
export function searchOnlineLyrics(
  query: string,
  sources?: string[],
  geniusToken?: string | null
): Promise<LyricsSearchResponse> {
  return invoke<LyricsSearchResponse>("song_search_online", {
    query,
    sources,
    geniusToken: geniusToken || null,
  })
}

/** Resolve the full lyrics for a chosen search hit. */
export function fetchOnlineLyrics(hit: LyricsHit): Promise<LyricsContent> {
  return invoke<LyricsContent>("song_fetch_lyrics", { hit })
}
