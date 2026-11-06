//! Shared HTTP client and host allow-list for lyrics providers.

use std::time::Duration;

use crate::error::ProviderError;

/// Descriptive UA — some lyrics APIs (LRCLIB) ask clients to identify
/// themselves and reject an empty/default agent.
const USER_AGENT: &str = "LumenLive/0.1 (https://github.com/ifeanyiachi/lumenlive)";

/// Per-request ceiling so one slow provider can't stall a fan-out.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Hosts any provider is allowed to reach. Fetching happens in Rust (outside the
/// webview CSP), so — mirroring `resource_store.rs` — every reachable host is
/// explicitly allow-listed to bound SSRF: a hit's `reference` URL (which can
/// originate from a third-party search result) is validated against this list
/// before any request. Grows as providers are added.
pub const ALLOWED_HOSTS: &[&str] = &[
    "lrclib.net",
    "api.genius.com",
    "genius.com",
];

/// Build the shared client. Cheap to clone (`reqwest::Client` wraps an `Arc`).
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(REQUEST_TIMEOUT)
        .build()
        .expect("reqwest client with static config always builds")
}

/// Reject any URL that isn't HTTPS to an allow-listed host.
pub fn validate_url(raw: &str) -> Result<(), ProviderError> {
    let parsed =
        url::Url::parse(raw).map_err(|e| ProviderError::Other(format!("invalid url: {e}")))?;
    if parsed.scheme() != "https" {
        return Err(ProviderError::Other("url must use https".into()));
    }
    match parsed.host_str() {
        Some(host) if ALLOWED_HOSTS.contains(&host) => Ok(()),
        Some(host) => Err(ProviderError::DisallowedHost(host.to_string())),
        None => Err(ProviderError::Other("url has no host".into())),
    }
}

#[cfg(test)]
mod tests {
    use super::validate_url;

    #[test]
    fn accepts_allow_listed_https() {
        assert!(validate_url("https://lrclib.net/api/search").is_ok());
    }

    #[test]
    fn rejects_non_https() {
        assert!(validate_url("http://lrclib.net/api/search").is_err());
    }

    #[test]
    fn rejects_unknown_host() {
        assert!(validate_url("https://evil.example.com/steal").is_err());
    }
}
