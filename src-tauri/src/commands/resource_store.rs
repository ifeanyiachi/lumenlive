//! In-app resource store — Bible translation install/remove commands.
//!
//! Downloads happen here in Rust (not the webview) so large translation DBs
//! stream straight to disk with a SHA-256 integrity check, bypassing the
//! localhost-only webview CSP entirely. Each downloaded translation lands in its
//! own `SQLite` file under `app_data_dir()/bibles/` and is `ATTACH`ed onto the
//! Bible connection under a global id (>= 1000); the set is tracked in
//! `installed-translations.json` so it survives restarts (re-attached at
//! startup — see `lib.rs`).

#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::bible_state::BibleState;
use lumenlive_bible::{InstalledRegistry, InstalledTranslation};

/// Folder (under the app data dir) holding downloaded translation DBs and the
/// install registry.
const BIBLES_DIR: &str = "bibles";
/// Registry file name. Shared with the import commands (`bible_import.rs`), which
/// land their generated DBs in the same folder and record them here too.
pub(crate) const REGISTRY_FILE: &str = "installed-translations.json";

/// Progress event name emitted during a download. Payload: [`ProgressPayload`].
const PROGRESS_EVENT: &str = "store:progress";

/// URL of the store catalog manifest (JSON). Fetched in Rust so it isn't subject
/// to the webview CSP; validated against [`ALLOWED_HOSTS`] like any download.
const MANIFEST_URL: &str =
    "https://pub-82480c48c8b84f8ca5162b8d42bd99d0.r2.dev/bible-translations/manifest.json";

/// Hosts the store is allowed to download from. Validating the URL host against
/// this list stops a tampered manifest from pointing downloads at an arbitrary
/// origin (SSRF / drive-by). Matches the R2 bucket already used to distribute
/// Bible source data.
const ALLOWED_HOSTS: &[&str] = &["pub-82480c48c8b84f8ca5162b8d42bd99d0.r2.dev"];

/// Request to install one Bible translation, built by the frontend from a
/// validated catalog manifest entry.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BibleInstallRequest {
    /// Manifest slug, e.g. `"web"`. Used as the resource key and file stem.
    pub resource_id: String,
    /// HTTPS URL of the zstd-compressed translation DB.
    pub url: String,
    /// Expected SHA-256 (hex) of the compressed download.
    pub sha256: String,
    /// Expected compressed size in bytes (used as a progress fallback).
    pub bytes: u64,
    /// License name to record in the registry.
    pub license: String,
    pub schema_version: i64,
}

/// Returned to the frontend after a successful install so it can refresh the
/// translation picker without a full reload.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledBibleInfo {
    pub global_id: i64,
    pub abbreviation: String,
    pub title: String,
    pub language: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    resource_id: String,
    received: u64,
    total: u64,
}

/// Resolve `app_data_dir()/bibles`, the folder holding translation files.
pub(crate) fn bibles_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join(BIBLES_DIR))
}

/// Reject any URL that isn't HTTPS to an allow-listed host.
fn validate_url(raw: &str) -> Result<(), String> {
    let parsed = url::Url::parse(raw).map_err(|e| format!("invalid download url: {e}"))?;
    if parsed.scheme() != "https" {
        return Err("download url must use https".to_string());
    }
    match parsed.host_str() {
        Some(host) if ALLOWED_HOSTS.contains(&host) => Ok(()),
        Some(host) => Err(format!("host '{host}' is not an allowed store host")),
        None => Err("download url has no host".to_string()),
    }
}

/// A filesystem-safe stem derived from a resource id (defensive; ids are slugs).
pub(crate) fn sanitize(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn hex_encode(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        let _ = write!(s, "{b:02x}");
    }
    s
}

/// Fetch the raw catalog manifest JSON. Parsing and validation happen on the
/// client (see `lib/resource-store/manifest.ts`), which tolerates entries a
/// newer manifest introduces.
#[tauri::command]
pub async fn store_fetch_manifest() -> Result<String, String> {
    validate_url(MANIFEST_URL)?;
    let response = reqwest::get(MANIFEST_URL)
        .await
        .map_err(|e| format!("fetch manifest failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("fetch manifest failed: HTTP {}", response.status()));
    }
    response
        .text()
        .await
        .map_err(|e| format!("read manifest failed: {e}"))
}

/// Download, verify, decompress, and attach a Bible translation.
///
/// Streams the compressed DB to a temp file (emitting `store:progress`), checks
/// its SHA-256, zstd-decompresses it into place, then attaches it and records
/// the install. The attach + registry write happen synchronously under the
/// Bible lock, so concurrent installs can't race on id allocation.
#[tauri::command]
pub async fn store_install_bible(
    app: AppHandle,
    state: State<'_, Mutex<BibleState>>,
    request: BibleInstallRequest,
) -> Result<InstalledBibleInfo, String> {
    validate_url(&request.url)?;

    let dir = bibles_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create bibles dir: {e}"))?;
    let registry_path = dir.join(REGISTRY_FILE);

    // Fast-fail on an obvious duplicate (re-checked under the lock later).
    if InstalledRegistry::load(&registry_path)
        .map_err(|e| e.to_string())?
        .find_by_resource(&request.resource_id)
        .is_some()
    {
        return Err(format!("'{}' is already installed", request.resource_id));
    }

    let stem = sanitize(&request.resource_id);
    let tmp_zst = dir.join(format!("{stem}.db.zst.part"));
    let tmp_db = dir.join(format!("{stem}.db.tmp"));
    let file_name = format!("{stem}.db");
    let final_path = dir.join(&file_name);

    // ── Download (streamed) with progress + running SHA-256 ──
    let response = reqwest::get(&request.url)
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(request.bytes);

    {
        use std::io::Write;
        let mut file =
            std::fs::File::create(&tmp_zst).map_err(|e| format!("create temp file: {e}"))?;
        let mut hasher = Sha256::new();
        let mut received: u64 = 0;
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("download error: {e}"))?;
            hasher.update(&chunk);
            file.write_all(&chunk)
                .map_err(|e| format!("write temp file: {e}"))?;
            received += chunk.len() as u64;
            let _ = app.emit(
                PROGRESS_EVENT,
                ProgressPayload {
                    resource_id: request.resource_id.clone(),
                    received,
                    total,
                },
            );
        }
        file.flush().map_err(|e| format!("flush temp file: {e}"))?;

        let digest = hex_encode(&hasher.finalize());
        if !digest.eq_ignore_ascii_case(&request.sha256) {
            let _ = std::fs::remove_file(&tmp_zst);
            return Err("checksum mismatch — download corrupted or tampered".to_string());
        }
    }

    // ── Decompress zstd → temp .db, then move into place ──
    {
        let zin = std::fs::File::open(&tmp_zst).map_err(|e| format!("open temp file: {e}"))?;
        let mut zout =
            std::fs::File::create(&tmp_db).map_err(|e| format!("create db file: {e}"))?;
        zstd::stream::copy_decode(zin, &mut zout).map_err(|e| format!("decompress: {e}"))?;
    }
    let _ = std::fs::remove_file(&tmp_zst);
    std::fs::rename(&tmp_db, &final_path).map_err(|e| format!("finalize db file: {e}"))?;

    // ── Attach + register (critical section, no await while locked) ──
    let outcome = register_install(&state, &registry_path, &final_path, &file_name, &request);
    if outcome.is_err() {
        // Roll back the file so a failed install leaves no orphan.
        let _ = std::fs::remove_file(&final_path);
    }
    outcome
}

/// The synchronous attach + registry-write step for a download. Delegates to
/// the shared [`attach_and_register`], which the import commands reuse too.
fn register_install(
    state: &State<'_, Mutex<BibleState>>,
    registry_path: &Path,
    final_path: &Path,
    file_name: &str,
    request: &BibleInstallRequest,
) -> Result<InstalledBibleInfo, String> {
    attach_and_register(
        state,
        registry_path,
        final_path,
        file_name,
        &request.resource_id,
        &request.license,
        request.schema_version,
    )
}

/// Attach a standalone translation `.db` and record it in the registry, holding
/// the Bible lock across id allocation, attach, and save so two concurrent
/// installs/imports can't collide on a global id. Rolls the attach back if the
/// registry write fails. Shared by the resource-store install path and the
/// user-import path (`bible_import.rs`).
pub(crate) fn attach_and_register(
    state: &State<'_, Mutex<BibleState>>,
    registry_path: &Path,
    final_path: &Path,
    file_name: &str,
    resource_id: &str,
    license: &str,
    schema_version: i64,
) -> Result<InstalledBibleInfo, String> {
    let bible = state.lock().map_err(|e| e.to_string())?;
    let db = bible
        .db
        .as_ref()
        .ok_or_else(|| "Bible database not loaded".to_string())?;

    let mut registry = InstalledRegistry::load(registry_path).map_err(|e| e.to_string())?;
    if registry.find_by_resource(resource_id).is_some() {
        return Err(format!("'{resource_id}' is already installed"));
    }
    let global_id = registry.next_global_id();

    let info = db
        .attach_translation(global_id, final_path)
        .map_err(|e| e.to_string())?;

    registry.insert(InstalledTranslation {
        global_id,
        local_id: info.local_id,
        resource_id: resource_id.to_string(),
        abbreviation: info.abbreviation.clone(),
        title: info.title.clone(),
        language: info.language.clone(),
        license: license.to_string(),
        is_copyrighted: info.is_copyrighted,
        file_name: file_name.to_string(),
        schema_version,
    });
    if let Err(e) = registry.save(registry_path) {
        // Undo the attach so on-disk state and live state stay consistent.
        let _ = db.detach_translation(global_id);
        return Err(e.to_string());
    }

    Ok(InstalledBibleInfo {
        global_id,
        abbreviation: info.abbreviation,
        title: info.title,
        language: info.language,
    })
}

/// Uninstall a downloaded translation: detach it, drop it from the registry, and
/// delete its file. If it was the active translation, fall back to id 1 (KJV).
#[tauri::command]
pub fn store_remove_bible(
    app: AppHandle,
    state: State<'_, Mutex<BibleState>>,
    translation_id: i64,
) -> Result<(), String> {
    let dir = bibles_dir(&app)?;
    let registry_path = dir.join(REGISTRY_FILE);

    let mut registry = InstalledRegistry::load(&registry_path).map_err(|e| e.to_string())?;
    let entry = registry
        .remove(translation_id)
        .ok_or_else(|| format!("translation {translation_id} is not installed"))?;

    {
        let mut bible = state.lock().map_err(|e| e.to_string())?;
        if let Some(db) = bible.db.as_ref() {
            db.detach_translation(translation_id)
                .map_err(|e| e.to_string())?;
        }
        if bible.active_translation_id == translation_id {
            bible.active_translation_id = 1;
        }
    }

    registry.save(&registry_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(dir.join(&entry.file_name));
    Ok(())
}

/// List the downloaded translations recorded in the registry.
#[tauri::command]
pub fn store_list_installed(app: AppHandle) -> Result<Vec<InstalledTranslation>, String> {
    let dir = bibles_dir(&app)?;
    let registry_path = dir.join(REGISTRY_FILE);
    Ok(InstalledRegistry::load(&registry_path)
        .map_err(|e| e.to_string())?
        .translations)
}
