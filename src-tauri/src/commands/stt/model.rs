//! Model resolution and STT provider construction: builds the operator-selected
//! primary provider (Deepgram cloud or on-device Moonshine) plus the optional
//! on-device fallback used when the cloud link drops mid-service.

use tauri::{AppHandle, Manager};

use lumenlive_stt::{DeepgramClient, SttConfig, SttProvider};

use super::truncate_safe;

/// Resolve the bundled Moonshine model directory (dev tree first, then packaged
/// resources). Shared by the sherpa primary path and the Deepgram→Moonshine
/// offline fallback so both look in exactly the same place.
///   - Dev:  `{CARGO_MANIFEST_DIR}/../models/sherpa/<model>`
///   - Prod: `resource_dir()/models/sherpa/<model>`
#[cfg(feature = "sherpa")]
fn resolve_moonshine_model_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let model_subdir = std::path::Path::new("models")
        .join("sherpa")
        .join("sherpa-onnx-moonshine-base-en-int8");
    let dev_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(&model_subdir);
    if dev_path.exists() {
        return Ok(dev_path);
    }
    app.path()
        .resource_dir()
        .map(|p| p.join(&model_subdir))
        .ok()
        .filter(|p| p.exists())
        .ok_or_else(|| "Moonshine model not found. Run: bun run download:sherpa".to_string())
}

/// Inference threads for Moonshine — half the logical CPUs, at least one.
#[cfg(feature = "sherpa")]
fn moonshine_thread_count() -> i32 {
    let parallelism = std::thread::available_parallelism().map_or(4, usize::from);
    i32::try_from(parallelism / 2).unwrap_or(2).max(1)
}

/// Build the operator-selected primary STT provider. `provider_name == "sherpa"`
/// selects on-device Moonshine; anything else selects Deepgram (the default),
/// resolving the API key from the argument or the `DEEPGRAM_API_KEY` env var.
pub(super) fn build_provider(
    app: &AppHandle,
    provider_name: &str,
    api_key: String,
    device_id: Option<&str>,
    gain: Option<f32>,
    pause_silence_ms: Option<u32>,
    sherpa_partials: bool,
) -> Result<Box<dyn SttProvider>, String> {
    match provider_name {
        #[cfg(feature = "sherpa")]
        "sherpa" => {
            let model_dir = resolve_moonshine_model_dir(app)?;
            let n_threads = moonshine_thread_count();

            log::info!(
                "Starting sherpa (Moonshine) transcription: model_dir={}, threads={n_threads}, device_id={device_id:?}, pause_silence_ms={pause_silence_ms:?}, partials={sherpa_partials}",
                model_dir.display()
            );

            Ok(Box::new(lumenlive_stt::SherpaProvider::new(
                model_dir,
                n_threads,
                pause_silence_ms,
                sherpa_partials,
            )))
        }
        #[cfg(not(feature = "sherpa"))]
        "sherpa" => {
            Err("Sherpa support not compiled. Rebuild with --features sherpa".into())
        }
        _ => {
            // Deepgram (default)
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
                "Starting Deepgram transcription: api_key={}..., device_id={device_id:?}, gain={gain:?}",
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
    }
}

/// Build the offline failover provider. If the cloud provider loses the network
/// mid-service, transcription continues on-device with Moonshine instead of
/// going dark. Built eagerly (cheap — only stores paths; the model loads lazily
/// when the fallback's `start()` runs). `None` when the primary is already
/// Moonshine, or when the model isn't available.
pub(super) fn build_fallback(
    #[cfg_attr(not(feature = "sherpa"), allow(unused_variables))] app: &AppHandle,
    #[cfg_attr(not(feature = "sherpa"), allow(unused_variables))] provider_name: &str,
    #[cfg_attr(not(feature = "sherpa"), allow(unused_variables))] pause_silence_ms: Option<u32>,
    #[cfg_attr(not(feature = "sherpa"), allow(unused_variables))] sherpa_partials: bool,
) -> Option<Box<dyn SttProvider>> {
    #[cfg(feature = "sherpa")]
    {
        if provider_name == "sherpa" {
            None
        } else {
            match resolve_moonshine_model_dir(app) {
                Ok(dir) => Some(Box::new(lumenlive_stt::SherpaProvider::new(
                    dir,
                    moonshine_thread_count(),
                    pause_silence_ms,
                    sherpa_partials,
                ))),
                Err(e) => {
                    log::warn!("[STT] Offline fallback unavailable: {e}");
                    None
                }
            }
        }
    }
    #[cfg(not(feature = "sherpa"))]
    {
        None
    }
}
