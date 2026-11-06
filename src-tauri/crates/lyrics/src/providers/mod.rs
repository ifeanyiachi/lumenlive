//! Lyrics providers: one module per source, all behind a common trait so the
//! fan-out in `lib.rs` and the UI treat them uniformly.

mod genius;
mod lrclib;

use async_trait::async_trait;
use reqwest::Client;

use crate::error::ProviderError;
use crate::model::{LyricsContent, LyricsHit};

pub use genius::Genius;
pub use lrclib::LrcLib;

/// One lyrics source. `search` is a cheap listing; `fetch` resolves the full
/// text for a chosen hit (a no-op when the hit already embeds its lyrics).
#[async_trait]
pub trait LyricsProvider: Send + Sync {
    /// Stable id, also the `LyricsHit.source` value.
    fn id(&self) -> &'static str;

    /// List matches for `query`. Errors are isolated per provider by the caller.
    async fn search(&self, client: &Client, query: &str) -> Result<Vec<LyricsHit>, ProviderError>;

    /// Resolve the full lyrics for one of this provider's hits.
    async fn fetch(&self, client: &Client, hit: &LyricsHit) -> Result<LyricsContent, ProviderError>;
}

/// Every provider known to the app, in display order. `genius_token` is the
/// access token from the app's Songs settings (env-var fallback applied inside
/// [`Genius`]); it's irrelevant to the token-free providers. Phase 3 pushes the
/// remaining scraper providers (`CeeNaija`, `SongLyrics`, `AZLyrics`) here.
pub fn all(genius_token: Option<String>) -> Vec<Box<dyn LyricsProvider>> {
    vec![Box::new(LrcLib), Box::new(Genius::new(genius_token))]
}
