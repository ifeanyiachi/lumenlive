//! Genius provider — search via the official API (needs an access token), then
//! scrape the lyrics off the returned song page (public HTML, no token). The
//! token comes from the app's Songs settings (threaded through
//! [`crate::search`]); when unset it falls back to the `GENIUS_ACCESS_TOKEN`
//! env var (loaded from `.env` by the app). With neither the provider is
//! silently skipped. See <https://docs.genius.com>.

use async_trait::async_trait;
use reqwest::Client;
use scraper::{Html, Selector};
use serde::Deserialize;

use crate::error::ProviderError;
use crate::html::{element_text, tidy_lyrics};
use crate::http;
use crate::model::{LyricsContent, LyricsHit};

const SEARCH_URL: &str = "https://api.genius.com/search";
const TOKEN_ENV: &str = "GENIUS_ACCESS_TOKEN";
/// Genius wraps every lyric line in one or more of these containers.
const LYRICS_SELECTOR: &str = r#"[data-lyrics-container="true"]"#;

/// The Genius provider. Carries an optional access token supplied by the app's
/// settings; [`token`](Genius::token) falls back to the env var when it's unset.
#[derive(Default)]
pub struct Genius {
    token: Option<String>,
}

impl Genius {
    /// Build the provider with an optional access token from app settings. A
    /// `None` or blank token defers to the `GENIUS_ACCESS_TOKEN` env var.
    pub fn new(token: Option<String>) -> Self {
        Self {
            token: token.map(|t| t.trim().to_string()).filter(|t| !t.is_empty()),
        }
    }

    /// The effective Genius token: the settings value first, then the env var,
    /// or `None` when neither is set.
    fn token(&self) -> Option<String> {
        self.token.clone().or_else(token_from_env)
    }
}

#[derive(Debug, Deserialize)]
struct SearchResp {
    response: SearchInner,
}

#[derive(Debug, Deserialize)]
struct SearchInner {
    hits: Vec<HitWrap>,
}

#[derive(Debug, Deserialize)]
struct HitWrap {
    result: SongResult,
}

#[derive(Debug, Deserialize)]
struct SongResult {
    title: Option<String>,
    url: Option<String>,
    primary_artist: Option<Artist>,
    song_art_image_thumbnail_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Artist {
    name: Option<String>,
}

#[async_trait]
impl super::LyricsProvider for Genius {
    fn id(&self) -> &'static str {
        "genius"
    }

    async fn search(&self, client: &Client, query: &str) -> Result<Vec<LyricsHit>, ProviderError> {
        let Some(token) = self.token() else {
            // No token configured — skip quietly rather than erroring every search.
            return Ok(Vec::new());
        };
        http::validate_url(SEARCH_URL)?;
        let resp = client
            .get(SEARCH_URL)
            .query(&[("q", query)])
            .bearer_auth(token)
            .send()
            .await?;
        if !resp.status().is_success() {
            return Err(ProviderError::Status(resp.status().as_u16()));
        }
        let body = resp.text().await?;
        Ok(hits_from_json(&body))
    }

    async fn fetch(&self, client: &Client, hit: &LyricsHit) -> Result<LyricsContent, ProviderError> {
        http::validate_url(&hit.reference)?;
        let resp = client.get(&hit.reference).send().await?;
        if !resp.status().is_success() {
            return Err(ProviderError::Status(resp.status().as_u16()));
        }
        let page = resp.text().await?;
        let lyrics = extract_lyrics(&page).ok_or(ProviderError::NotFound)?;
        Ok(LyricsContent {
            source: self.id().to_string(),
            title: hit.title.clone(),
            artist: hit.artist.clone(),
            album: hit.album.clone(),
            plain_lyrics: lyrics,
            synced_lyrics: None,
            source_url: Some(hit.reference.clone()),
        })
    }
}

/// The Genius token from the `GENIUS_ACCESS_TOKEN` env var, or `None` when
/// unset/blank. Used as a fallback when settings don't supply one.
fn token_from_env() -> Option<String> {
    std::env::var(TOKEN_ENV)
        .ok()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
}

/// Map the Genius `/search` JSON to hits, dropping rows without a title or URL.
fn hits_from_json(body: &str) -> Vec<LyricsHit> {
    let Ok(parsed) = serde_json::from_str::<SearchResp>(body) else {
        return Vec::new();
    };
    parsed
        .response
        .hits
        .into_iter()
        .filter_map(|h| {
            let r = h.result;
            let title = r.title?.trim().to_string();
            let url = r.url?;
            if title.is_empty() || url.is_empty() {
                return None;
            }
            Some(LyricsHit {
                source: "genius".to_string(),
                title,
                artist: r.primary_artist.and_then(|a| a.name).unwrap_or_default(),
                album: None,
                duration_sec: None,
                reference: url,
                has_synced: false,
                plain_lyrics: None,
                synced_lyrics: None,
                thumbnail_url: r.song_art_image_thumbnail_url,
            })
        })
        .collect()
}

/// Pull the lyrics out of a Genius song page, concatenating every lyrics
/// container (Genius splits long songs across several) with line breaks kept.
fn extract_lyrics(page_html: &str) -> Option<String> {
    let doc = Html::parse_document(page_html);
    let sel = Selector::parse(LYRICS_SELECTOR).expect("static selector is valid");
    let mut text = String::new();
    for container in doc.select(&sel) {
        text.push_str(&element_text(container));
        text.push('\n');
    }
    let tidy = tidy_lyrics(&text);
    (!tidy.is_empty()).then_some(tidy)
}

#[cfg(test)]
mod tests {
    use super::{extract_lyrics, hits_from_json, Genius};

    #[test]
    fn new_keeps_a_real_token() {
        assert_eq!(Genius::new(Some("  tok-123 ".into())).token, Some("tok-123".into()));
    }

    #[test]
    fn new_treats_blank_token_as_absent() {
        // A blank settings value must not shadow the env-var fallback.
        assert_eq!(Genius::new(Some("   ".into())).token, None);
        assert_eq!(Genius::new(None).token, None);
    }

    #[test]
    fn maps_search_hits() {
        let body = r#"{"response":{"hits":[
            {"result":{"title":"Amazing Grace","url":"https://genius.com/x","primary_artist":{"name":"John Newton"},"song_art_image_thumbnail_url":"https://img/x.png"}},
            {"result":{"title":null,"url":"https://genius.com/y"}}
        ]}}"#;
        let hits = hits_from_json(body);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "Amazing Grace");
        assert_eq!(hits[0].artist, "John Newton");
        assert_eq!(hits[0].reference, "https://genius.com/x");
    }

    #[test]
    fn extracts_lyrics_across_containers() {
        let html = r#"<html><body>
            <div data-lyrics-container="true">[Verse 1]<br>Amazing grace<br>how sweet</div>
            <div data-lyrics-container="true">[Chorus]<br>My chains are gone</div>
        </body></html>"#;
        let lyrics = extract_lyrics(html).unwrap();
        assert_eq!(
            lyrics,
            "[Verse 1]\nAmazing grace\nhow sweet\n[Chorus]\nMy chains are gone"
        );
    }

    #[test]
    fn returns_none_without_containers() {
        assert!(extract_lyrics("<html><body>no lyrics here</body></html>").is_none());
    }
}
