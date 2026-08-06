//! Wire model for online lyrics search — the types shared with the frontend
//! (serde `camelCase`, mirrored in `src/types/lyrics.ts`).

use serde::{Deserialize, Serialize};

/// A lightweight search result from one provider. Returned in bulk from
/// [`crate::search`]; the operator picks one and the app calls [`crate::fetch`]
/// (or reuses embedded lyrics) to resolve the full text.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsHit {
    /// Provider id that produced this hit — also the `LyricsHit.source` value
    /// [`crate::fetch`] dispatches on (`"lrclib"`, `"genius"`, …).
    pub source: String,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    /// Track length in seconds, when the provider reports it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_sec: Option<u32>,
    /// Provider-specific handle `fetch` resolves — a URL for scrapers, an id for
    /// APIs. Empty when the hit already embeds its lyrics (LRCLIB).
    #[serde(default)]
    pub reference: String,
    /// Whether time-synced (LRC) lyrics are available for this hit.
    pub has_synced: bool,
    /// Full plain lyrics, when the search response already carried them (LRCLIB).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plain_lyrics: Option<String>,
    /// Synced (LRC) lyrics, when already carried by the search response.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced_lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

/// The resolved full lyrics for one hit, normalised across providers.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsContent {
    pub source: String,
    pub title: String,
    pub artist: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    pub plain_lyrics: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced_lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
}

/// One provider's failure during a fan-out search, surfaced to the UI so a dead
/// source shows as a per-source notice instead of failing the whole search.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFailure {
    pub source: String,
    pub message: String,
}

/// Aggregated result of a fan-out search: hits from every provider that
/// answered, plus a per-source failure list for those that did not.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    pub hits: Vec<LyricsHit>,
    pub errors: Vec<ProviderFailure>,
}
