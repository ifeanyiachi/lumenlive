//! STT provider construction. Deepgram (cloud) is the only backend.

use lumenlive_stt::{DeepgramClient, SttConfig, SttProvider};

use super::truncate_safe;

/// Build the Deepgram STT provider, resolving the API key from the argument or
/// the `DEEPGRAM_API_KEY` env var.
pub(super) fn build_provider(api_key: String) -> Result<Box<dyn SttProvider>, String> {
    let resolved_api_key = if api_key.is_empty() {
        std::env::var("DEEPGRAM_API_KEY").unwrap_or_default()
    } else {
        api_key
    };

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
