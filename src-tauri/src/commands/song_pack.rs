//! Community song-pack fetch command.
//!
//! Downloads a ZIP archive of songs (a GitHub repo, a `tree/<branch>` page, or a
//! direct `.zip` link) and hands the raw bytes back to the frontend, which unzips
//! and imports each song file. The fetch runs here in Rust — not the webview — so
//! it bypasses the localhost-only CSP, and every hop is checked against a host
//! allow-list so a redirect can't turn this into an SSRF primitive.
//!
//! GitHub *page* URLs are rewritten to the `codeload.github.com` archive
//! endpoint: `.../zip/HEAD` for the default branch, or `.../zip/refs/heads/<b>`
//! when the URL names a branch (`/tree/<b>`). Any other host must supply a direct
//! archive link.

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Hosts we will download an archive from (initial URL *and* every redirect hop).
/// Kept deliberately narrow: the big public forges plus the CDN hosts GitHub and
/// Bitbucket redirect archive downloads to.
const ALLOWED_HOSTS: &[&str] = &[
    "github.com",
    "codeload.github.com",
    "objects.githubusercontent.com",
    "raw.githubusercontent.com",
    "gitlab.com",
    "bitbucket.org",
];

/// Hard cap on a downloaded pack (uncompressed transfer size). Generous enough
/// for a large worship repo, small enough that a hostile link can't exhaust RAM.
const MAX_PACK_BYTES: u64 = 250 * 1024 * 1024;

/// Progress event emitted while a pack downloads. `total` is 0 when the server
/// sends no `Content-Length` (common for `codeload` archives) — treat as
/// indeterminate.
const PROGRESS_EVENT: &str = "song:pack-progress";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    received: u64,
    total: u64,
}

fn is_allowed_host(host: &str) -> bool {
    ALLOWED_HOSTS.contains(&host.to_ascii_lowercase().as_str())
}

/// Turn a user-supplied URL into a concrete archive URL to download.
///
/// GitHub repo/`tree` pages are rewritten to their `codeload` zip endpoint;
/// everything else must already point at an archive on an allow-listed host.
fn resolve_pack_url(input: &str) -> Result<String, String> {
    let parsed = url::Url::parse(input.trim())
        .map_err(|e| format!("that doesn't look like a valid URL: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("pack URL must use https".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or("pack URL has no host")?
        .to_ascii_lowercase();

    let path = parsed.path().to_ascii_lowercase();
    let is_zip = std::path::Path::new(&path)
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"));
    let looks_like_archive =
        is_zip || path.contains("/zip/") || path.contains("/-/archive/");

    if host == "github.com" && !looks_like_archive {
        let segs: Vec<&str> = parsed
            .path_segments()
            .map(|s| s.filter(|x| !x.is_empty()).collect())
            .unwrap_or_default();
        if segs.len() < 2 {
            return Err("not a recognizable GitHub repository URL".to_string());
        }
        let owner = segs[0];
        let repo = segs[1].trim_end_matches(".git");
        // `/{owner}/{repo}/tree/{branch}` → that branch; otherwise the default.
        if segs.len() >= 4 && segs[2] == "tree" {
            let branch = segs[3];
            return Ok(format!(
                "https://codeload.github.com/{owner}/{repo}/zip/refs/heads/{branch}"
            ));
        }
        return Ok(format!(
            "https://codeload.github.com/{owner}/{repo}/zip/HEAD"
        ));
    }

    if !is_allowed_host(&host) {
        return Err(format!(
            "'{host}' isn't a supported pack host — use a GitHub repository URL or a direct .zip link from GitHub/GitLab/Bitbucket"
        ));
    }
    Ok(parsed.to_string())
}

/// HTTP client that only follows redirects to allow-listed hosts, so a crafted
/// link can't bounce the request onto an internal address (SSRF).
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("LumenLive/0.1 (+https://github.com/ifeanyiachi/lumenlive)")
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let ok = attempt.url().host_str().is_some_and(is_allowed_host);
            if !ok {
                attempt.stop()
            } else if attempt.previous().len() > 10 {
                attempt.error("too many redirects")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| format!("http client init failed: {e}"))
}

/// Download a community song pack (ZIP) and return its raw bytes. The frontend
/// unzips and imports the entries; parsing never happens here. Emits
/// `song:pack-progress` as bytes arrive.
#[tauri::command]
pub async fn song_fetch_pack(app: AppHandle, url: String) -> Result<tauri::ipc::Response, String> {
    let archive_url = resolve_pack_url(&url)?;

    let response = client()?
        .get(&archive_url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "download failed: HTTP {} (check the URL is a public repository or archive)",
            response.status()
        ));
    }

    let total = response.content_length().unwrap_or(0);
    if total > MAX_PACK_BYTES {
        return Err(format!(
            "pack is too large ({} MB); the limit is {} MB",
            total / (1024 * 1024),
            MAX_PACK_BYTES / (1024 * 1024)
        ));
    }

    let mut buf: Vec<u8> = Vec::with_capacity(total.min(8 * 1024 * 1024) as usize);
    let mut received: u64 = 0;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download error: {e}"))?;
        received += chunk.len() as u64;
        if received > MAX_PACK_BYTES {
            return Err(format!(
                "pack exceeded the {} MB size limit while downloading",
                MAX_PACK_BYTES / (1024 * 1024)
            ));
        }
        buf.extend_from_slice(&chunk);
        let _ = app.emit(PROGRESS_EVENT, ProgressPayload { received, total });
    }

    Ok(tauri::ipc::Response::new(buf))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_github_repo_to_default_branch_archive() {
        assert_eq!(
            resolve_pack_url("https://github.com/mattgraham/worship").unwrap(),
            "https://codeload.github.com/mattgraham/worship/zip/HEAD"
        );
    }

    #[test]
    fn strips_trailing_git_and_slash() {
        assert_eq!(
            resolve_pack_url("https://github.com/mattgraham/worship.git/").unwrap(),
            "https://codeload.github.com/mattgraham/worship/zip/HEAD"
        );
    }

    #[test]
    fn rewrites_tree_url_to_named_branch() {
        assert_eq!(
            resolve_pack_url("https://github.com/openlyrics/openlyrics/tree/master").unwrap(),
            "https://codeload.github.com/openlyrics/openlyrics/zip/refs/heads/master"
        );
    }

    #[test]
    fn passes_direct_zip_on_allowed_host() {
        let u = "https://codeload.github.com/x/y/zip/refs/heads/main";
        assert_eq!(resolve_pack_url(u).unwrap(), u);
    }

    #[test]
    fn rejects_non_https() {
        assert!(resolve_pack_url("http://github.com/a/b").is_err());
    }

    #[test]
    fn rejects_disallowed_host() {
        assert!(resolve_pack_url("https://evil.example.com/pack.zip").is_err());
        // A non-archive path on a disallowed host is rejected too.
        assert!(resolve_pack_url("https://example.com/a/b").is_err());
    }

    #[test]
    fn rejects_incomplete_github_url() {
        assert!(resolve_pack_url("https://github.com/onlyowner").is_err());
    }
}
