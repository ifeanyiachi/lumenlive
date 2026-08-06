//! LRCLIB provider — a free, key-less lyrics API whose search response already
//! embeds both plain and time-synced (LRC) lyrics, so `fetch` needs no second
//! request. See <https://lrclib.net/docs>.

use async_trait::async_trait;
use reqwest::Client;
use serde::Deserialize;

use crate::error::ProviderError;
use crate::http;
use crate::model::{LyricsContent, LyricsHit};

const SEARCH_URL: &str = "https://lrclib.net/api/search";

pub struct LrcLib;

/// One row of the LRCLIB `/api/search` response. Lyric fields are null for
/// instrumental tracks.
#[derive(Debug, Deserialize)]
#[allow(
    clippy::struct_field_names,
    reason = "field names mirror the LRCLIB JSON schema"
)]
struct Track {
    #[serde(rename = "trackName")]
    track_name: Option<String>,
    #[serde(rename = "artistName")]
    artist_name: Option<String>,
    #[serde(rename = "albumName")]
    album_name: Option<String>,
    duration: Option<f64>,
    #[serde(rename = "plainLyrics")]
    plain_lyrics: Option<String>,
    #[serde(rename = "syncedLyrics")]
    synced_lyrics: Option<String>,
}

#[async_trait]
impl super::LyricsProvider for LrcLib {
    fn id(&self) -> &'static str {
        "lrclib"
    }

    async fn search(&self, client: &Client, query: &str) -> Result<Vec<LyricsHit>, ProviderError> {
        http::validate_url(SEARCH_URL)?;
        let resp = client.get(SEARCH_URL).query(&[("q", query)]).send().await?;
        if !resp.status().is_success() {
            return Err(ProviderError::Status(resp.status().as_u16()));
        }
        let tracks: Vec<Track> = resp.json().await?;
        Ok(tracks.into_iter().filter_map(to_hit).collect())
    }

    async fn fetch(&self, _client: &Client, hit: &LyricsHit) -> Result<LyricsContent, ProviderError> {
        // LRCLIB search already carried the lyrics; resolve from the hit rather
        // than making a second request.
        let plain = hit
            .plain_lyrics
            .clone()
            .or_else(|| hit.synced_lyrics.as_deref().map(strip_lrc_timestamps))
            .ok_or(ProviderError::NotFound)?;
        Ok(LyricsContent {
            source: self.id().to_string(),
            title: hit.title.clone(),
            artist: hit.artist.clone(),
            album: hit.album.clone(),
            plain_lyrics: plain,
            synced_lyrics: hit.synced_lyrics.clone(),
            source_url: None,
        })
    }
}

/// Map an LRCLIB track to a hit, dropping rows with no lyrics (instrumentals)
/// or no title.
#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    reason = "track durations are small, non-negative second counts"
)]
fn to_hit(t: Track) -> Option<LyricsHit> {
    if t.plain_lyrics.is_none() && t.synced_lyrics.is_none() {
        return None;
    }
    let title = t.track_name?.trim().to_string();
    if title.is_empty() {
        return None;
    }
    Some(LyricsHit {
        source: "lrclib".to_string(),
        title,
        artist: t.artist_name.unwrap_or_default(),
        album: t.album_name.filter(|s| !s.is_empty()),
        duration_sec: t
            .duration
            .filter(|d| d.is_finite() && *d >= 0.0)
            .map(|d| d.round() as u32),
        reference: String::new(),
        has_synced: t.synced_lyrics.is_some(),
        plain_lyrics: t.plain_lyrics,
        synced_lyrics: t.synced_lyrics,
        thumbnail_url: None,
    })
}

/// Strip leading `[mm:ss.xx]` (and `[tag:value]`) markers from an LRC blob to
/// recover plain lyrics — a fallback when only synced lyrics are present.
fn strip_lrc_timestamps(lrc: &str) -> String {
    lrc.lines()
        .map(|line| {
            let mut rest = line.trim_start();
            while rest.starts_with('[') {
                match rest.find(']') {
                    Some(end) => rest = rest[end + 1..].trim_start(),
                    None => break,
                }
            }
            rest
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::strip_lrc_timestamps;

    #[test]
    fn strips_lrc_markers() {
        let lrc = "[00:12.34]Amazing grace\n[00:15.00]How sweet the sound";
        assert_eq!(
            strip_lrc_timestamps(lrc),
            "Amazing grace\nHow sweet the sound"
        );
    }

    #[test]
    fn drops_leading_metadata_tags() {
        let lrc = "[ar:John Newton]\n[00:01.00]Line one";
        assert_eq!(strip_lrc_timestamps(lrc), "Line one");
    }
}
