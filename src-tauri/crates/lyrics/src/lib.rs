//! Online lyrics search — fans a query out across providers and resolves full
//! lyrics for a chosen result.
//!
//! Fetching lives here (Rust) rather than the webview so providers aren't
//! subject to the localhost-only CSP, and every reachable host is allow-listed
//! (`http::ALLOWED_HOSTS`) to bound SSRF — the same posture as
//! `resource_store.rs`.
//!
//! Ships LRCLIB (clean JSON API, includes synced lyrics) and Genius (official
//! API search + page scrape, needs an access token); [`providers::all`] is
//! where later phases add `CeeNaija`, etc.

mod error;
mod html;
mod http;
mod model;
mod providers;

pub use error::ProviderError;
pub use model::{LyricsContent, LyricsHit, ProviderFailure, SearchResponse};
pub use providers::LyricsProvider;

use std::time::Duration;

/// Per-provider ceiling for a search — a dead source fails fast without holding
/// up results from the live ones.
const PROVIDER_TIMEOUT: Duration = http::REQUEST_TIMEOUT;

/// Fan a query out across the selected providers concurrently and merge the
/// results. Never errors as a whole: a provider that fails or times out is
/// recorded in [`SearchResponse::errors`] while the rest still return hits.
///
/// `sources` optionally restricts the query to a subset of provider ids; `None`
/// or an empty slice queries all of them. `genius_token` is the Genius access
/// token from the app's Songs settings (Genius is skipped when it and the
/// `GENIUS_ACCESS_TOKEN` env var are both unset).
pub async fn search(
    query: &str,
    sources: Option<&[String]>,
    genius_token: Option<String>,
) -> SearchResponse {
    let query = query.trim();
    if query.is_empty() {
        return SearchResponse::default();
    }

    let client = http::client();
    let providers = providers::all(genius_token);
    let selected = providers.iter().filter(|p| match sources {
        Some(ids) if !ids.is_empty() => ids.iter().any(|id| id == p.id()),
        _ => true,
    });

    let tasks = selected.map(|p| {
        let client = client.clone();
        async move {
            let outcome = tokio::time::timeout(PROVIDER_TIMEOUT, p.search(&client, query)).await;
            (p.id(), outcome)
        }
    });

    let mut response = SearchResponse::default();
    for (source, outcome) in futures::future::join_all(tasks).await {
        match outcome {
            Ok(Ok(mut hits)) => response.hits.append(&mut hits),
            Ok(Err(e)) => response.errors.push(ProviderFailure {
                source: source.to_string(),
                message: e.to_string(),
            }),
            Err(_) => response.errors.push(ProviderFailure {
                source: source.to_string(),
                message: "timed out".to_string(),
            }),
        }
    }
    response
}

/// Resolve the full lyrics for a hit, dispatching on `hit.source`.
pub async fn fetch(hit: &LyricsHit) -> Result<LyricsContent, ProviderError> {
    let client = http::client();
    // Resolving a hit's full lyrics never needs the Genius token — Genius `fetch`
    // scrapes the public song page — so we don't thread it through here.
    let providers = providers::all(None);
    let provider = providers
        .iter()
        .find(|p| p.id() == hit.source)
        .ok_or_else(|| ProviderError::Other(format!("unknown source '{}'", hit.source)))?;
    provider.fetch(&client, hit).await
}

#[cfg(test)]
mod tests {
    use super::search;

    #[tokio::test]
    async fn empty_query_short_circuits() {
        let res = search("   ", None, None).await;
        assert!(res.hits.is_empty());
        assert!(res.errors.is_empty());
    }

    #[tokio::test]
    async fn unknown_source_filter_yields_nothing() {
        // No provider matches, so no network work and an empty response.
        let res = search("grace", Some(&["nope".to_string()]), None).await;
        assert!(res.hits.is_empty());
        assert!(res.errors.is_empty());
    }
}
