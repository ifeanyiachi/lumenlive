//! Online lyrics search commands. Thin wrappers over the `lumenlive-lyrics`
//! crate, which owns provider logic, the host allow-list, and HTTP. Fetching
//! runs here in Rust so providers bypass the webview CSP (see the crate docs).

use lumenlive_lyrics::{LyricsContent, LyricsHit, SearchResponse};

/// Fan a query out across online lyric providers. Returns partial results: a
/// provider that fails is reported in `SearchResponse.errors`, not raised.
#[tauri::command]
pub async fn song_search_online(
    query: String,
    sources: Option<Vec<String>>,
    genius_token: Option<String>,
) -> Result<SearchResponse, String> {
    Ok(lumenlive_lyrics::search(&query, sources.as_deref(), genius_token).await)
}

/// Resolve the full lyrics for a chosen search hit.
#[tauri::command]
pub async fn song_fetch_lyrics(hit: LyricsHit) -> Result<LyricsContent, String> {
    lumenlive_lyrics::fetch(&hit)
        .await
        .map_err(|e| e.to_string())
}
