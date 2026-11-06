//! Error type for lyrics providers.

use thiserror::Error;

/// A failure while searching or fetching from one provider. Isolated per
/// provider by [`crate::search`] so a single bad source never fails the whole
/// fan-out.
#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("provider returned HTTP {0}")]
    Status(u16),
    #[error("host '{0}' is not allow-listed")]
    DisallowedHost(String),
    #[error("no lyrics found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}
