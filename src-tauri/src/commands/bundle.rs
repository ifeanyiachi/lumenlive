#![expect(clippy::needless_pass_by_value)]

//! Self-contained content bundles.
//!
//! Content exported for another machine can't just reference media by id or by
//! absolute path — those resolve only against the *source* machine's library. So
//! a bundle is a **zip archive** that packages everything the content needs:
//!
//! ```text
//! export.<ext>                (a zip container)
//! ├── manifest.json           the exported document(s) + metadata
//! └── media/<file>            the raw image/video/audio bytes
//! ```
//!
//! This is the shared byte-mover for every bundle format in the app — schedule
//! bundles (`.lumsched`), single theme / stage-layout bundles (`.lumtheme`), and
//! the full-library backup (`.lumbackup`). All three share exactly this
//! `manifest.json` + `media/…` shape; only the manifest *contents* differ, and
//! that's the JS side's concern.
//!
//! [`write_bundle`] streams the picked media files straight into the zip (no
//! base64, no whole-file buffering — large videos never hit memory).
//! [`read_bundle`] auto-detects the format by the leading bytes: a real zip is
//! unpacked (media extracted into the managed media-library, so the extracted
//! files are owned by the app exactly like a normal copy-import), while a
//! plain-JSON file (a legacy schedule export) is handed back verbatim so old
//! schedules still open. The JS side owns all id remapping; this command only
//! moves bytes.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::Path;
use tauri::Manager;

use crate::commands::media::{unique_dest, LIBRARY_DIR};

/// One media file to embed, as chosen by the exporter. `zip_name` is the entry
/// name under `media/` in the archive; it is echoed back on import so the JS
/// side can map an extracted path onto the right manifest entry.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleMediaFile {
    pub src_path: String,
    pub zip_name: String,
}

/// A media entry that was extracted from a bundle into the managed library.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedMedia {
    /// The archive entry name under `media/` (matches `BundleMediaFile.zip_name`).
    pub zip_name: String,
    /// Absolute path of the extracted file in the managed media-library.
    pub path: String,
}

/// Result of reading a picked schedule file.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleReadResult {
    /// The bundle's `manifest.json` text — or, for a legacy plain-JSON export,
    /// the whole file text. Parsing/validation is the JS side's job.
    pub manifest_json: String,
    /// Media extracted into the managed library (empty for a legacy file).
    pub media: Vec<ExtractedMedia>,
    /// True when the picked file was a plain-JSON (v1) schedule rather than a
    /// zip bundle, so the caller routes it through the old parser.
    pub legacy: bool,
}

/// Write a self-contained content bundle (zip) to `dest_path`.
///
/// The `manifest_json` is stored deflated; media is stored uncompressed (images
/// and video are already compressed, so deflating them just burns CPU) and
/// streamed from disk. A media source that no longer exists on disk is skipped
/// rather than aborting the whole export — the JS side pre-filters and reports
/// anything missing.
#[tauri::command]
pub fn write_bundle(
    dest_path: String,
    manifest_json: String,
    media: Vec<BundleMediaFile>,
) -> Result<(), String> {
    let file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create bundle file: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);

    let deflated = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", deflated)
        .map_err(|e| format!("Failed to write manifest: {e}"))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("Failed to write manifest: {e}"))?;

    // `large_file(true)` forces zip64 for the entry so a video larger than 4 GiB
    // still packages correctly.
    let stored = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored)
        .large_file(true);
    for m in &media {
        let src = Path::new(&m.src_path);
        if !src.exists() {
            continue;
        }
        zip.start_file(format!("media/{}", m.zip_name), stored)
            .map_err(|e| format!("Failed to add '{}': {e}", m.zip_name))?;
        let mut f = std::fs::File::open(src)
            .map_err(|e| format!("Failed to open '{}': {e}", m.src_path))?;
        std::io::copy(&mut f, &mut zip)
            .map_err(|e| format!("Failed to package '{}': {e}", m.src_path))?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize bundle: {e}"))?;
    Ok(())
}

/// Read a picked bundle file: unpack a zip bundle (extracting media into the
/// managed library) or return a legacy plain-JSON export verbatim.
#[tauri::command]
pub fn read_bundle(
    app: tauri::AppHandle,
    bundle_path: String,
) -> Result<BundleReadResult, String> {
    // Detect a zip by its local-file-header magic ("PK\x03\x04"). Everything
    // else is treated as the legacy plain-JSON export.
    let is_zip = {
        let mut header = [0u8; 4];
        match std::fs::File::open(&bundle_path).and_then(|mut f| f.read(&mut header)) {
            Ok(n) => n >= 4 && &header == b"PK\x03\x04",
            Err(e) => return Err(format!("Failed to open schedule file: {e}")),
        }
    };

    if !is_zip {
        let text = std::fs::read_to_string(&bundle_path)
            .map_err(|e| format!("Failed to read schedule file: {e}"))?;
        return Ok(BundleReadResult {
            manifest_json: text,
            media: Vec::new(),
            legacy: true,
        });
    }

    let file = std::fs::File::open(&bundle_path)
        .map_err(|e| format!("Failed to open bundle: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Bundle isn't a valid archive: {e}"))?;

    let manifest_json = {
        let mut mf = archive
            .by_name("manifest.json")
            .map_err(|_| "This bundle is missing its manifest.".to_string())?;
        let mut s = String::new();
        mf.read_to_string(&mut s)
            .map_err(|e| format!("Failed to read manifest: {e}"))?;
        s
    };

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join(LIBRARY_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create library dir: {e}"))?;

    let mut media = Vec::new();
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read bundle entry: {e}"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        let Some(rel) = name.strip_prefix("media/") else {
            continue;
        };
        if rel.is_empty() {
            continue;
        }
        // Extract under the entry's *file name only* — never any embedded path —
        // so a maliciously crafted "media/../../evil" entry can't escape the
        // library dir (zip-slip guard).
        let safe_name = Path::new(rel)
            .file_name()
            .map_or_else(|| rel.replace('/', "_"), |n| n.to_string_lossy().to_string());
        let dest = unique_dest(&dir, &safe_name, i);
        let mut out = std::fs::File::create(&dest)
            .map_err(|e| format!("Failed to write extracted media: {e}"))?;
        std::io::copy(&mut entry, &mut out)
            .map_err(|e| format!("Failed to extract '{rel}': {e}"))?;
        media.push(ExtractedMedia {
            zip_name: rel.to_string(),
            path: dest.to_string_lossy().to_string(),
        });
    }

    Ok(BundleReadResult {
        manifest_json,
        media,
        legacy: false,
    })
}
