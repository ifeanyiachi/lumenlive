//! STT provider construction. Branches on [`SttBackend`] so the pipeline can run
//! Soniox (cloud default), Deepgram Nova-3, or Nemotron (on-device) behind the same
//! [`SttProvider`] trait.

use lumenlive_stt::{
    DeepgramClient, NemotronClient, NemotronConfig, SonioxClient, SonioxConfig, SttBackend,
    SttProvider,
};
use std::path::PathBuf;

use super::truncate_safe;

/// Build the STT provider for `backend`, resolving the API key from the argument
/// or the backend's env-var fallback.
pub(super) fn build_provider(
    backend: SttBackend,
    api_key: String,
    model_dir: Option<PathBuf>,
) -> Result<Box<dyn SttProvider>, String> {
    match backend {
        SttBackend::Soniox => build_soniox(api_key),
        SttBackend::Deepgram => build_deepgram(api_key),
        SttBackend::Nemotron => build_nemotron(model_dir),
    }
}

fn build_nemotron(model_dir: Option<PathBuf>) -> Result<Box<dyn SttProvider>, String> {
    let model_dir = model_dir.ok_or_else(|| {
        "English on-device transcription is not installed. Download it from Transcription settings."
            .to_string()
    })?;

    let num_threads = std::thread::available_parallelism()
        .map(|count| count.get().clamp(2, 4) as i32)
        .unwrap_or(2);
    log::info!(
        "Starting offline English transcription: model_dir={}, threads={num_threads}, language=en",
        model_dir.display()
    );

    Ok(Box::new(NemotronClient::new(NemotronConfig {
        model_dir,
        sample_rate: 16_000,
        num_threads,
    })))
}

fn build_deepgram(api_key: String) -> Result<Box<dyn SttProvider>, String> {
    let key = resolve_key(api_key, "DEEPGRAM_API_KEY");
    if key.is_empty() {
        return Err(
            "No Deepgram key provided. Configure it in the account portal or set DEEPGRAM_API_KEY."
                .into(),
        );
    }
    log::info!("Starting Deepgram Nova-3 transcription");
    Ok(Box::new(DeepgramClient::new(key)))
}

/// Soniox real-time (`stt-rt-v5`). Key falls back to `SONIOX_API_KEY`. The client
/// builds its `context` payload from `bible_keyterms()` itself, so only transport
/// config lives here.
fn build_soniox(api_key: String) -> Result<Box<dyn SttProvider>, String> {
    let resolved_api_key = resolve_key(api_key, "SONIOX_API_KEY");

    if resolved_api_key.is_empty() {
        return Err(
            "No Soniox API key provided. Set it in Settings or via SONIOX_API_KEY env var.".into(),
        );
    }

    log::info!(
        "Starting Soniox transcription: api_key={}...",
        truncate_safe(&resolved_api_key, 8)
    );

    let soniox_config = SonioxConfig {
        api_key: resolved_api_key,
        ..SonioxConfig::default()
    };

    Ok(Box::new(SonioxClient::new(soniox_config)))
}

/// Use the passed key if non-empty, else fall back to `env_var`.
fn resolve_key(api_key: String, env_var: &str) -> String {
    if api_key.is_empty() {
        std::env::var(env_var).unwrap_or_default()
    } else {
        api_key
    }
}

/// Map the frontend's provider discriminator to a backend. Unknown/absent values
/// default to the Soniox cloud backend.
pub(super) fn parse_backend(provider: Option<&str>) -> SttBackend {
    match provider {
        Some(p) if p.eq_ignore_ascii_case("deepgram") => SttBackend::Deepgram,
        Some(p) if p.eq_ignore_ascii_case("nemotron") => SttBackend::Nemotron,
        _ => SttBackend::Soniox,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_deepgram_and_preserves_legacy_default() {
        assert_eq!(parse_backend(Some("deepgram")), SttBackend::Deepgram);
        assert_eq!(parse_backend(Some("Deepgram")), SttBackend::Deepgram);
        assert_eq!(parse_backend(Some("nemotron")), SttBackend::Nemotron);
        assert_eq!(parse_backend(None), SttBackend::Soniox);
        assert_eq!(parse_backend(Some("soniox")), SttBackend::Soniox);
    }
}
