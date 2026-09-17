//! STT provider construction. Branches on [`SttBackend`] so the pipeline can run
//! either Deepgram (cloud, default) or Soniox (experimental A/B backend) behind
//! the same [`SttProvider`] trait (see `soniox.md`).

use lumenlive_stt::{
    DeepgramClient, SonioxClient, SonioxConfig, SttBackend, SttConfig, SttProvider,
};

use super::truncate_safe;

/// Build the STT provider for `backend`, resolving the API key from the argument
/// or the backend's env-var fallback.
pub(super) fn build_provider(
    backend: SttBackend,
    api_key: String,
) -> Result<Box<dyn SttProvider>, String> {
    match backend {
        SttBackend::Deepgram => build_deepgram(api_key),
        SttBackend::Soniox => build_soniox(api_key),
    }
}

/// Deepgram (Nova-3). Key falls back to `DEEPGRAM_API_KEY`.
fn build_deepgram(api_key: String) -> Result<Box<dyn SttProvider>, String> {
    let resolved_api_key = resolve_key(api_key, "DEEPGRAM_API_KEY");

    if resolved_api_key.is_empty() {
        return Err(
            "No Deepgram API key provided. Set it in Settings or via DEEPGRAM_API_KEY env var."
                .into(),
        );
    }

    log::info!(
        "Starting Deepgram transcription: api_key={}...",
        truncate_safe(&resolved_api_key, 8)
    );

    let stt_config = SttConfig {
        api_key: resolved_api_key,
        model: "nova-3".to_string(),
        sample_rate: 16_000,
        encoding: "linear16".to_string(),
        language: None,
    };

    Ok(Box::new(DeepgramClient::new(stt_config)))
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
/// default to Deepgram — the frontend `provider` wiring lands in Phase 3, so
/// today's callers (which send nothing) keep the Deepgram path.
pub(super) fn parse_backend(provider: Option<&str>) -> SttBackend {
    match provider {
        Some(p) if p.eq_ignore_ascii_case("soniox") => SttBackend::Soniox,
        _ => SttBackend::Deepgram,
    }
}
