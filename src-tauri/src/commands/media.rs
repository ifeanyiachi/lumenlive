#![expect(clippy::needless_pass_by_value)]

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// Folder name (under the app data dir) that holds copied media files.
const LIBRARY_DIR: &str = "media-library";

/// Build a collision-free destination path inside `dir` for a file whose
/// original name is `original_name`. Uses a millisecond timestamp plus the
/// batch index for uniqueness, then bumps a counter if the (extremely
/// unlikely) path already exists on disk.
fn unique_dest(dir: &Path, original_name: &str, index: usize) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let mut counter = 0u32;
    loop {
        let suffix = if counter == 0 {
            String::new()
        } else {
            format!("-{counter}")
        };
        let candidate = dir.join(format!("{stamp}-{index}{suffix}-{original_name}"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub media_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov", "avi", "mkv"];
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma"];

fn classify_media(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    let ext_ref: &str = &ext;
    if IMAGE_EXTENSIONS.contains(&ext_ref) {
        Some("image")
    } else if VIDEO_EXTENSIONS.contains(&ext_ref) {
        Some("video")
    } else if AUDIO_EXTENSIONS.contains(&ext_ref) {
        Some("audio")
    } else {
        None
    }
}

#[tauri::command]
pub fn import_media_files(paths: Vec<String>) -> Result<Vec<MediaFileInfo>, String> {
    let mut results = Vec::new();

    for path_str in &paths {
        let path = Path::new(path_str);
        if !path.exists() {
            continue;
        }

        let Some(media_type) = classify_media(path) else {
            continue;
        };

        let metadata = std::fs::metadata(path).map_err(|e| e.to_string())?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let (width, height) = if media_type == "image" {
            match image::image_dimensions(path) {
                Ok((w, h)) => (Some(w), Some(h)),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        results.push(MediaFileInfo {
            path: path_str.clone(),
            name,
            size: metadata.len(),
            media_type: media_type.to_string(),
            width,
            height,
        });
    }

    Ok(results)
}

/// Copy imported files into the app-managed media library folder and return
/// their new (managed) paths plus metadata. Each file is stored under a
/// UUID-prefixed name so two sources named `logo.png` never collide. Files are
/// classified/validated exactly like `import_media_files`; unsupported or
/// missing paths are skipped. A single failed copy aborts with an error rather
/// than silently dropping the file.
#[tauri::command]
pub fn copy_media_to_library(
    app: tauri::AppHandle,
    paths: Vec<String>,
) -> Result<Vec<MediaFileInfo>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join(LIBRARY_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create library dir: {e}"))?;

    let mut results = Vec::new();

    for (index, path_str) in paths.iter().enumerate() {
        let src = Path::new(path_str);
        if !src.exists() {
            continue;
        }

        let Some(media_type) = classify_media(src) else {
            continue;
        };

        let original_name = src
            .file_name().map_or_else(|| "file".to_string(), |n| n.to_string_lossy().to_string());

        let dest = unique_dest(&dir, &original_name, index);

        std::fs::copy(src, &dest)
            .map_err(|e| format!("Failed to copy '{original_name}': {e}"))?;

        let size = std::fs::metadata(&dest).map_or(0, |m| m.len());

        let (width, height) = if media_type == "image" {
            match image::image_dimensions(&dest) {
                Ok((w, h)) => (Some(w), Some(h)),
                Err(_) => (None, None),
            }
        } else {
            (None, None)
        };

        results.push(MediaFileInfo {
            path: dest.to_string_lossy().to_string(),
            name: original_name,
            size,
            media_type: media_type.to_string(),
            width,
            height,
        });
    }

    Ok(results)
}

/// Persist raw media bytes (base64-encoded) into the app-managed media library.
///
/// Used when the source isn't a file on disk — e.g. an image extracted from a
/// `.pptx` archive during presentation import. `file_name` supplies the
/// extension used for classification/dimensions and the stored name. Behaves
/// like [`copy_media_to_library`] otherwise: writes under a collision-free name
/// and returns the managed path plus metadata. Unsupported extensions are
/// rejected with an error rather than silently skipped, since the caller passed
/// exactly one file expecting it to be stored.
#[tauri::command]
pub fn save_media_bytes(
    app: tauri::AppHandle,
    file_name: String,
    data_base64: String,
) -> Result<MediaFileInfo, String> {
    let name_path = Path::new(&file_name);
    let Some(media_type) = classify_media(name_path) else {
        return Err(format!("Unsupported media type: {file_name}"));
    };

    let bytes = STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("Failed to decode media bytes: {e}"))?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {e}"))?
        .join(LIBRARY_DIR);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create library dir: {e}"))?;

    let original_name = name_path
        .file_name().map_or_else(|| "file".to_string(), |n| n.to_string_lossy().to_string());

    let dest = unique_dest(&dir, &original_name, 0);
    std::fs::write(&dest, &bytes).map_err(|e| format!("Failed to write '{original_name}': {e}"))?;

    let size = std::fs::metadata(&dest).map_or(0, |m| m.len());
    let (width, height) = if media_type == "image" {
        match image::image_dimensions(&dest) {
            Ok((w, h)) => (Some(w), Some(h)),
            Err(_) => (None, None),
        }
    } else {
        (None, None)
    };

    Ok(MediaFileInfo {
        path: dest.to_string_lossy().to_string(),
        name: original_name,
        size,
        media_type: media_type.to_string(),
        width,
        height,
    })
}

#[tauri::command]
pub fn generate_thumbnail(path: String, max_size: u32) -> Result<String, String> {
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {e}"))?;
    let thumbnail = img.thumbnail(max_size, max_size);

    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    thumbnail
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode thumbnail: {e}"))?;

    let b64 = STANDARD.encode(&buf);
    Ok(format!("data:image/png;base64,{b64}"))
}
