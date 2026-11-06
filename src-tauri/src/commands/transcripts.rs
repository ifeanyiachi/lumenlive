#![expect(clippy::needless_pass_by_value, reason = "Tauri command extractors require pass-by-value")]

//! Reading back durable transcript recordings.
//!
//! Each transcription session writes one plain-text `.log` file under
//! `<app_log_dir>/transcripts/` (see [`super::stt::TranscriptRecorder`]). These
//! commands let the operator list the most recent recordings and export one to a
//! location of their choosing (from Settings → Backup & Restore) — the raw files
//! live in the OS log directory, which is otherwise awkward to reach by hand.
//!
//! There is no session index or database: a "recording" is just a file, and its
//! start time is encoded in the filename (`transcript-YYYYMMDD-HHMMSSZ.log`,
//! UTC). Listing therefore reads the directory, sorts by name (which sorts
//! chronologically), and parses the timestamp back out of each name.

use serde::Serialize;
use tauri::{AppHandle, Manager};
use time::{Date, Month, Time};

/// Prefix and suffix of a per-session transcript filename. Kept in sync with
/// `TranscriptRecorder::begin`, which writes `transcript-YYYYMMDD-HHMMSSZ.log`.
const PREFIX: &str = "transcript-";
const SUFFIX: &str = ".log";

/// One transcript recording on disk, as surfaced to the UI.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptFileInfo {
    /// Bare filename, e.g. `transcript-20261019-143000Z.log`. Passed back to
    /// [`export_transcript`] to identify which recording to copy.
    pub name: String,
    /// Epoch milliseconds (UTC) when the session started, parsed from the
    /// filename. `None` when the name doesn't match the expected pattern — the
    /// row still lists, just without a timestamp.
    pub recorded_at: Option<i64>,
    /// File size in bytes, for a rough sense of how long the service ran.
    pub size_bytes: u64,
}

/// Parse the UTC start time encoded in a transcript filename into epoch millis.
/// Returns `None` for any name that isn't exactly `transcript-YYYYMMDD-HHMMSSZ.log`.
fn parse_recorded_at(name: &str) -> Option<i64> {
    let core = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    // core == "YYYYMMDD-HHMMSSZ"
    let core = core.strip_suffix('Z').unwrap_or(core);
    let (date, time) = core.split_once('-')?;
    if date.len() != 8 || time.len() != 6 {
        return None;
    }
    let year: i32 = date.get(0..4)?.parse().ok()?;
    let month: u8 = date.get(4..6)?.parse().ok()?;
    let day: u8 = date.get(6..8)?.parse().ok()?;
    let hour: u8 = time.get(0..2)?.parse().ok()?;
    let minute: u8 = time.get(2..4)?.parse().ok()?;
    let second: u8 = time.get(4..6)?.parse().ok()?;

    let month = Month::try_from(month).ok()?;
    let date = Date::from_calendar_date(year, month, day).ok()?;
    let time = Time::from_hms(hour, minute, second).ok()?;
    Some(date.with_time(time).assume_utc().unix_timestamp() * 1000)
}

/// Reject anything that isn't a bare transcript filename, so a caller can never
/// coax `export_transcript` into reading a file outside the transcripts dir
/// (path-traversal guard — the name is used only as a leaf under that dir).
fn is_valid_transcript_name(name: &str) -> bool {
    name.starts_with(PREFIX)
        && name.ends_with(SUFFIX)
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
}

/// List the most recent transcript recordings, newest first.
///
/// `limit` caps how many are returned (the UI asks for the latest three). A
/// missing transcripts directory (nothing recorded yet) is not an error — it
/// returns an empty list.
#[tauri::command]
pub fn list_recent_transcripts(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<TranscriptFileInfo>, String> {
    let dir = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Couldn't resolve the log directory: {e}"))?
        .join("transcripts");

    let read = match std::fs::read_dir(&dir) {
        Ok(read) => read,
        // No recordings yet (or the dir was never created) — an empty list, not
        // a failure the operator should see.
        Err(_) => return Ok(Vec::new()),
    };

    let mut files: Vec<TranscriptFileInfo> = Vec::new();
    for entry in read.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_valid_transcript_name(&name) {
            continue;
        }
        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        let recorded_at = parse_recorded_at(&name);
        files.push(TranscriptFileInfo {
            name,
            recorded_at,
            size_bytes,
        });
    }

    // Filenames start with the UTC timestamp, so a plain descending sort by name
    // puts the newest session first.
    files.sort_by(|a, b| b.name.cmp(&a.name));
    if let Some(limit) = limit {
        files.truncate(limit);
    }
    Ok(files)
}

/// Copy one recorded transcript to `dest_path` (a location the operator picked
/// via the save dialog). `name` must be a bare transcript filename; it is
/// resolved only against the transcripts directory.
#[tauri::command]
pub fn export_transcript(app: AppHandle, name: String, dest_path: String) -> Result<(), String> {
    if !is_valid_transcript_name(&name) {
        return Err("That isn't a valid transcript file.".into());
    }
    let src = app
        .path()
        .app_log_dir()
        .map_err(|e| format!("Couldn't resolve the log directory: {e}"))?
        .join("transcripts")
        .join(&name);
    if !src.exists() {
        return Err("That transcript no longer exists.".into());
    }
    std::fs::copy(&src, &dest_path)
        .map_err(|e| format!("Couldn't export that transcript: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_recorded_timestamp_from_a_filename() {
        // The name should decode to exactly 2026-10-19 14:30:00 UTC. Build the
        // expected instant with the same calendar API so the assertion checks
        // the field extraction, not a hand-computed epoch constant.
        let expected = Date::from_calendar_date(2026, Month::October, 19)
            .unwrap()
            .with_time(Time::from_hms(14, 30, 0).unwrap())
            .assume_utc()
            .unix_timestamp()
            * 1000;
        assert_eq!(
            parse_recorded_at("transcript-20261019-143000Z.log"),
            Some(expected)
        );
    }

    #[test]
    fn rejects_names_that_do_not_match_the_pattern() {
        assert!(parse_recorded_at("transcript-bogus.log").is_none());
        assert!(parse_recorded_at("not-a-transcript.log").is_none());
        assert!(parse_recorded_at("transcript-20261019-143000Z.txt").is_none());
        // Out-of-range date/time components fail construction rather than panic.
        assert!(parse_recorded_at("transcript-20261345-259999Z.log").is_none());
    }

    #[test]
    fn validates_names_and_blocks_traversal() {
        assert!(is_valid_transcript_name("transcript-20261019-143000Z.log"));
        assert!(!is_valid_transcript_name("transcript-../../etc/passwd.log"));
        assert!(!is_valid_transcript_name("transcript-sub/dir.log"));
        assert!(!is_valid_transcript_name("evil.log"));
        assert!(!is_valid_transcript_name("transcript-20261019-143000Z.txt"));
    }
}
