//! Store-managed offline speech-to-text models.
//!
//! Offline ASR models are intentionally downloaded into the per-user app-data
//! directory. They are not Tauri resources and therefore are not copied into
//! installers or bundled with the application binary.

#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::path::{Component, Path, PathBuf};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

pub(crate) const MODEL_ID: &str = "nemotron-speech-streaming-en-0.6b-560ms-int8";
const MODEL_TITLE: &str = "LumenLive On-device (English)";
const MODEL_VERSION: &str = "2026-04-25";
const MODEL_ARCHIVE_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemotron-speech-streaming-en-0.6b-560ms-int8-2026-04-25.tar.bz2";
const MODEL_DIR: &str = "nemotron-speech-streaming-en-0.6b-560ms-int8";
const MODEL_ARCHIVE_BYTES: u64 = 1_296_904 * 1024;
pub(crate) const NEMOTRON35_MODEL_ID: &str = "nemotron-3.5-asr-streaming-0.6b-560ms-int8";
const NEMOTRON35_MODEL_TITLE: &str = "LumenLive On-device";
const NEMOTRON35_MODEL_VERSION: &str = "2026-06-11";
const NEMOTRON35_MODEL_ARCHIVE_URL: &str = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-560ms-int8-2026-06-11.tar.bz2";
const NEMOTRON35_MODEL_DIR: &str = "nemotron-3.5-asr-streaming-0.6b-560ms-int8";
const NEMOTRON35_MODEL_ARCHIVE_BYTES: u64 = 1_359_632 * 1024;
const STORE_PROGRESS_EVENT: &str = "store:progress";

const MODEL_FILES: &[&str] = &[
    "encoder.int8.onnx",
    "decoder.int8.onnx",
    "joiner.int8.onnx",
    "tokens.txt",
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    resource_id: String,
    received: u64,
    total: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineSttModelStatus {
    pub id: String,
    pub title: String,
    pub version: String,
    pub installed: bool,
    pub bytes: u64,
}

fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("failed to resolve app data dir: {e}"))?
        .join("models")
        .join("stt"))
}

pub(crate) fn installed_model_dir(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    #[cfg(debug_assertions)]
    if let Some(raw_path) = std::env::var_os("LUMENLIVE_NEMOTRON_MODEL_DIR") {
        let path = PathBuf::from(raw_path);
        if has_model_files(&path) {
            log::info!("Using developer English Nemotron model override: {}", path.display());
            return Ok(Some(path));
        }
        return Err(format!(
            "LUMENLIVE_NEMOTRON_MODEL_DIR is set but missing required model files: {}",
            path.display()
        ));
    }

    #[cfg(debug_assertions)]
    if let Some(path) = developer_model_dir("nemotron-speech") {
        log::info!("Using developer English Nemotron model: {}", path.display());
        return Ok(Some(path));
    }

    let path = models_dir(app)?.join(MODEL_DIR);
    if has_model_files(&path) {
        Ok(Some(path))
    } else {
        Ok(None)
    }
}

pub(crate) fn installed_nemotron35_model_dir(
    app: &AppHandle,
) -> Result<Option<PathBuf>, String> {
    #[cfg(debug_assertions)]
    if let Some(raw_path) = std::env::var_os("LUMENLIVE_NEMOTRON35_MODEL_DIR") {
        let path = PathBuf::from(raw_path);
        if has_model_files(&path) {
            log::info!("Using developer Nemotron 3.5 model override: {}", path.display());
            return Ok(Some(path));
        }
        return Err(format!(
            "LUMENLIVE_NEMOTRON35_MODEL_DIR is set but missing required model files: {}",
            path.display()
        ));
    }

    #[cfg(debug_assertions)]
    if let Some(path) = developer_model_dir("nemotron-3.5") {
        log::info!("Using developer Nemotron 3.5 model: {}", path.display());
        return Ok(Some(path));
    }

    let path = models_dir(app)?.join(NEMOTRON35_MODEL_DIR);
    if has_model_files(&path) {
        Ok(Some(path))
    } else {
        Ok(None)
    }
}

fn has_model_files(path: &Path) -> bool {
    path.is_dir() && MODEL_FILES.iter().all(|name| path.join(name).is_file())
}

#[cfg(debug_assertions)]
fn developer_model_dir(name_hint: &str) -> Option<PathBuf> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../models/dev");
    let entries = std::fs::read_dir(root).ok()?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir()
            || !path
                .file_name()
                .is_some_and(|name| name.to_string_lossy().contains(name_hint))
        {
            continue;
        }

        if has_model_files(&path) {
            return Some(path);
        }

        if let Ok(nested_entries) = std::fs::read_dir(path) {
            for nested in nested_entries.flatten() {
                let nested_path = nested.path();
                if nested_path.is_dir() && has_model_files(&nested_path) {
                    return Some(nested_path);
                }
            }
        }
    }

    None
}

fn has_required_files(path: &Path, required_files: &[&str]) -> bool {
    path.is_dir() && required_files.iter().all(|name| path.join(name).is_file())
}

fn validate_model_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url)
        .map_err(|e| format!("invalid offline model URL: {e}"))?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("github.com") {
        return Err("offline model URL must be an HTTPS GitHub release URL".into());
    }
    Ok(())
}

#[tauri::command]
pub fn offline_stt_model_status(app: AppHandle) -> Result<OfflineSttModelStatus, String> {
    Ok(OfflineSttModelStatus {
        id: MODEL_ID.into(),
        title: MODEL_TITLE.into(),
        version: MODEL_VERSION.into(),
        installed: installed_model_dir(&app)?.is_some(),
        bytes: MODEL_ARCHIVE_BYTES,
    })
}

/// Download and install the English on-device streaming model.
#[tauri::command]
pub async fn offline_stt_install_model(
    app: AppHandle,
) -> Result<OfflineSttModelStatus, String> {
    validate_model_url(MODEL_ARCHIVE_URL)?;
    let base_dir = models_dir(&app)?;
    std::fs::create_dir_all(&base_dir).map_err(|e| format!("create model directory: {e}"))?;

    let final_dir = base_dir.join(MODEL_DIR);
    if has_model_files(&final_dir) {
        return offline_stt_model_status(app);
    }
    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir)
            .map_err(|e| format!("remove incomplete English on-device model: {e}"))?;
    }

    let archive_path = base_dir.join(format!(".{MODEL_DIR}.tar.bz2.part"));
    let extract_dir = base_dir.join(format!(".{MODEL_DIR}.installing"));
    let _ = std::fs::remove_file(&archive_path);
    let _ = std::fs::remove_dir_all(&extract_dir);

    let response = reqwest::get(MODEL_ARCHIVE_URL)
        .await
        .map_err(|e| format!("English on-device transcription download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "English on-device transcription download failed: HTTP {}",
            response.status()
        ));
    }
    let total = response.content_length().unwrap_or(MODEL_ARCHIVE_BYTES);
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&archive_path)
            .map_err(|e| format!("create English on-device transcription archive: {e}"))?;
        let mut received = 0_u64;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk
                .map_err(|e| format!("English on-device transcription download error: {e}"))?;
            file.write_all(&chunk)
                .map_err(|e| format!("write English on-device transcription archive: {e}"))?;
            received += chunk.len() as u64;
            let _ = app.emit(
                STORE_PROGRESS_EVENT,
                ProgressPayload {
                    resource_id: MODEL_ID.into(),
                    received,
                    total,
                },
            );
        }
        file.flush()
            .map_err(|e| format!("flush English on-device transcription archive: {e}"))?;
    }

    let archive_for_extract = archive_path.clone();
    let extract_for_extract = extract_dir.clone();
    let final_for_extract = final_dir.clone();
    let extraction = tokio::task::spawn_blocking(move || {
        extract_and_install(
            &archive_for_extract,
            &extract_for_extract,
            &final_for_extract,
            MODEL_FILES,
        )
    })
    .await
    .map_err(|e| format!("English on-device transcription installer failed: {e}"))?;

    let _ = std::fs::remove_file(&archive_path);
    let _ = std::fs::remove_dir_all(&extract_dir);
    extraction?;

    offline_stt_model_status(app)
}

#[tauri::command]
pub fn offline_stt_remove_model(app: AppHandle) -> Result<(), String> {
    let path = models_dir(&app)?.join(MODEL_DIR);
    if path.exists() {
        std::fs::remove_dir_all(path)
            .map_err(|e| format!("remove English on-device transcription model: {e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn offline_stt_nemotron35_model_status(
    app: AppHandle,
) -> Result<OfflineSttModelStatus, String> {
    Ok(OfflineSttModelStatus {
        id: NEMOTRON35_MODEL_ID.into(),
        title: NEMOTRON35_MODEL_TITLE.into(),
        version: NEMOTRON35_MODEL_VERSION.into(),
        installed: installed_nemotron35_model_dir(&app)?.is_some(),
        bytes: NEMOTRON35_MODEL_ARCHIVE_BYTES,
    })
}

/// Download and install the multilingual Nemotron 3.5 streaming model.
#[tauri::command]
pub async fn offline_stt_install_nemotron35_model(
    app: AppHandle,
) -> Result<OfflineSttModelStatus, String> {
    validate_model_url(NEMOTRON35_MODEL_ARCHIVE_URL)?;
    let base_dir = models_dir(&app)?;
    std::fs::create_dir_all(&base_dir).map_err(|e| format!("create model directory: {e}"))?;

    let final_dir = base_dir.join(NEMOTRON35_MODEL_DIR);
    if has_model_files(&final_dir) {
        return offline_stt_nemotron35_model_status(app);
    }
    if final_dir.exists() {
        std::fs::remove_dir_all(&final_dir)
            .map_err(|e| format!("remove incomplete on-device model: {e}"))?;
    }

    let archive_path = base_dir.join(format!(".{NEMOTRON35_MODEL_DIR}.tar.bz2.part"));
    let extract_dir = base_dir.join(format!(".{NEMOTRON35_MODEL_DIR}.installing"));
    let _ = std::fs::remove_file(&archive_path);
    let _ = std::fs::remove_dir_all(&extract_dir);

    let response = reqwest::get(NEMOTRON35_MODEL_ARCHIVE_URL)
        .await
        .map_err(|e| format!("on-device transcription download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "on-device transcription download failed: HTTP {}",
            response.status()
        ));
    }
    let total = response
        .content_length()
        .unwrap_or(NEMOTRON35_MODEL_ARCHIVE_BYTES);
    {
        use std::io::Write;
        let mut file = std::fs::File::create(&archive_path)
            .map_err(|e| format!("create on-device transcription archive: {e}"))?;
        let mut received = 0_u64;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("on-device transcription download error: {e}"))?;
            file.write_all(&chunk)
                .map_err(|e| format!("write on-device transcription archive: {e}"))?;
            received += chunk.len() as u64;
            let _ = app.emit(
                STORE_PROGRESS_EVENT,
                ProgressPayload {
                    resource_id: NEMOTRON35_MODEL_ID.into(),
                    received,
                    total,
                },
            );
        }
        file.flush()
            .map_err(|e| format!("flush on-device transcription archive: {e}"))?;
    }

    let archive_for_extract = archive_path.clone();
    let extract_for_extract = extract_dir.clone();
    let final_for_extract = final_dir.clone();
    let extraction = tokio::task::spawn_blocking(move || {
        extract_and_install(
            &archive_for_extract,
            &extract_for_extract,
            &final_for_extract,
            MODEL_FILES,
        )
    })
    .await
    .map_err(|e| format!("on-device transcription installer failed: {e}"))?;

    let _ = std::fs::remove_file(&archive_path);
    let _ = std::fs::remove_dir_all(&extract_dir);
    extraction?;

    offline_stt_nemotron35_model_status(app)
}

#[tauri::command]
pub fn offline_stt_remove_nemotron35_model(app: AppHandle) -> Result<(), String> {
    let path = models_dir(&app)?.join(NEMOTRON35_MODEL_DIR);
    if path.exists() {
        std::fs::remove_dir_all(path)
            .map_err(|e| format!("remove on-device transcription model: {e}"))?;
    }
    Ok(())
}

fn extract_and_install(
    archive: &Path,
    extract_dir: &Path,
    final_dir: &Path,
    required_files: &[&str],
) -> Result<(), String> {
    extract_archive(archive, extract_dir)?;
    let source = locate_model_dir(extract_dir, required_files)
        .ok_or_else(|| "offline model archive is missing required model files".to_string())?;
    std::fs::rename(source, final_dir)
        .map_err(|e| format!("activate offline model: {e}"))
}

fn extract_archive(
    archive: &Path,
    extract_dir: &Path,
) -> Result<(), String> {
    std::fs::create_dir_all(extract_dir)
        .map_err(|e| format!("create model extraction directory: {e}"))?;
    let file = std::fs::File::open(archive).map_err(|e| format!("open model archive: {e}"))?;
    let decoder = bzip2::read::BzDecoder::new(file);
    let mut tar = tar::Archive::new(decoder);

    for entry in tar
        .entries()
        .map_err(|e| format!("read model archive: {e}"))?
    {
        let mut entry = entry.map_err(|e| format!("read model archive entry: {e}"))?;
        let entry_type = entry.header().entry_type();
        if !entry_type.is_file() && !entry_type.is_dir() {
            return Err("offline model archive contains an unsupported entry".into());
        }
        let relative = entry
            .path()
            .map_err(|e| format!("read model archive path: {e}"))?
            .into_owned();
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| matches!(component, Component::ParentDir))
        {
            return Err("offline model archive contains an unsafe path".into());
        }
        let destination = extract_dir.join(&relative);
        if entry_type.is_dir() {
            std::fs::create_dir_all(&destination)
                .map_err(|e| format!("create extracted model directory: {e}"))?;
        } else {
            if let Some(parent) = destination.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("create extracted model parent: {e}"))?;
            }
            entry
                .unpack(&destination)
                .map_err(|e| format!("extract model file: {e}"))?;
        }
    }

    Ok(())
}

fn locate_model_dir(root: &Path, required_files: &[&str]) -> Option<PathBuf> {
    if has_required_files(root, required_files) {
        return Some(root.to_path_buf());
    }
    let entries = std::fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && has_required_files(&path, required_files) {
            return Some(path);
        }
    }
    None
}
