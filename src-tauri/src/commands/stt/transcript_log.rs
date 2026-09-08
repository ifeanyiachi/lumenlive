//! Durable, per-session transcript recording.
//!
//! Why this exists separately from `tauri_plugin_log`: the app log rotates by
//! size and (by default, `KeepOne`) deletes all but one rotated file, so a full
//! service's transcript is overwritten within minutes — which is exactly why the
//! Sunday-service log was already gone when we went to diagnose a falsely
//! displayed verse. This recorder writes ONE dedicated file per transcription
//! session under `<app_log_dir>/transcripts/`, capturing the verbatim transcript
//! stream (every changed partial and every final) alongside every detection the
//! pipeline emits, so "what was said" and "what the detector fired" can be read
//! back together long after the service — with none of the memstats/ONNX noise
//! that fills the main log.
//!
//! It is deliberately best-effort and self-contained: a file-open or write
//! failure degrades to an inert no-op (logged once) and never disturbs the STT
//! hot path. Each record is flushed immediately so an unclean shutdown still
//! keeps everything up to the last line.

use std::fs;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};

use time::OffsetDateTime;

/// Records one transcription session's transcript + detections to its own file.
///
/// A single long-lived instance is held as Tauri managed state; [`Self::begin`]
/// opens a fresh file at the start of each session and [`Self::finish`] closes
/// it. Between sessions (and whenever a file could not be opened) every method
/// is a no-op.
#[derive(Default)]
pub struct TranscriptRecorder {
    writer: Option<BufWriter<fs::File>>,
    /// Path of the active file — kept for the "recording to …" start log and so
    /// callers/tests can locate the artifact.
    path: Option<PathBuf>,
}

impl TranscriptRecorder {
    /// Open a new per-session transcript file under `<log_dir>/transcripts/`.
    /// Any previously open session is flushed and closed first. Best-effort: on
    /// failure the recorder stays an inert no-op for this session.
    pub fn begin(&mut self, log_dir: &Path) {
        self.finish();

        let dir = log_dir.join("transcripts");
        if let Err(e) = fs::create_dir_all(&dir) {
            log::error!("[TRANSCRIPT-REC] could not create {}: {e}", dir.display());
            return;
        }

        let now = OffsetDateTime::now_utc();
        let name = format!(
            "transcript-{:04}{:02}{:02}-{:02}{:02}{:02}Z.log",
            now.year(),
            u8::from(now.month()),
            now.day(),
            now.hour(),
            now.minute(),
            now.second(),
        );
        let path = dir.join(name);

        match fs::File::create(&path) {
            Ok(file) => {
                let mut w = BufWriter::new(file);
                let _ = writeln!(
                    w,
                    "# LumenLive transcript session — started {} UTC",
                    Self::stamp(now)
                );
                let _ = w.flush();
                log::info!("[TRANSCRIPT-REC] recording session to {}", path.display());
                self.writer = Some(w);
                self.path = Some(path);
            }
            Err(e) => {
                log::error!("[TRANSCRIPT-REC] could not open {}: {e}", path.display());
            }
        }
    }

    /// Record a changed interim/partial transcript.
    pub fn partial(&mut self, text: &str) {
        self.write_line("PARTIAL", &format!("{text:?}"));
    }

    /// Record a finalized transcript segment (the ground truth of what was said).
    pub fn final_segment(&mut self, text: &str, confidence: f64, speech_final: bool) {
        self.write_line(
            "FINAL",
            &format!(
                "(conf {:.0}%, speech_final={speech_final}) {text:?}",
                confidence * 100.0
            ),
        );
    }

    /// Record a detection the pipeline emitted. `source` is e.g. `"direct"`,
    /// `"direct-partial"`, or `"semantic"`; `detail` is the reference + score.
    pub fn detection(&mut self, source: &str, detail: &str) {
        self.write_line("DETECT", &format!("[{source}] {detail}"));
    }

    /// Flush and close the active session file, if any. Idempotent.
    pub fn finish(&mut self) {
        if let Some(mut w) = self.writer.take() {
            let _ = writeln!(
                w,
                "# session ended {} UTC",
                Self::stamp(OffsetDateTime::now_utc())
            );
            let _ = w.flush();
        }
        self.path = None;
    }

    /// Write one timestamped `kind` line and flush immediately so an unclean
    /// exit still keeps the record. No-op when no session is open; a broken
    /// writer is dropped so it can't spam an error on every subsequent line.
    fn write_line(&mut self, kind: &str, body: &str) {
        let Some(w) = self.writer.as_mut() else {
            return;
        };
        let stamp = Self::stamp(OffsetDateTime::now_utc());
        if writeln!(w, "[{stamp}] {kind:<7} {body}")
            .and_then(|()| w.flush())
            .is_err()
        {
            self.writer = None;
            self.path = None;
        }
    }

    /// `HH:MM:SS.mmm`, UTC.
    fn stamp(t: OffsetDateTime) -> String {
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            t.hour(),
            t.minute(),
            t.second(),
            t.millisecond(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_op_before_begin() {
        // Every method must be safe to call with no session open.
        let mut r = TranscriptRecorder::default();
        r.partial("hello");
        r.final_segment("hello", 0.9, true);
        r.detection("direct", "John 3:16 (100%)");
        r.finish();
        assert!(r.path.is_none());
    }

    #[test]
    fn records_stream_to_file() {
        let dir = std::env::temp_dir().join(format!(
            "ll-transcript-rec-test-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);

        let mut r = TranscriptRecorder::default();
        r.begin(&dir);
        let path = r.path.clone().expect("session file open");

        r.partial("for god so");
        r.final_segment("for God so loved the world", 0.98, true);
        r.detection("direct", "John 3:16 (100%)");
        r.finish();
        assert!(r.path.is_none());

        let contents = fs::read_to_string(&path).expect("read back transcript");
        assert!(contents.contains("PARTIAL"), "partial recorded");
        assert!(
            contents.contains("for God so loved the world"),
            "final text recorded verbatim"
        );
        assert!(contents.contains("John 3:16"), "detection recorded");
        assert!(contents.contains("session ended"), "footer written on finish");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn begin_starts_a_fresh_file_each_session() {
        let dir = std::env::temp_dir().join(format!(
            "ll-transcript-rec-test2-{}-{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let _ = fs::remove_dir_all(&dir);

        let mut r = TranscriptRecorder::default();
        r.begin(&dir);
        r.final_segment("first session", 1.0, true);
        // begin() again must close the old file and open a new one.
        r.begin(&dir);
        r.final_segment("second session", 1.0, true);
        let second = r.path.clone().expect("second session open");
        r.finish();

        let second_contents = fs::read_to_string(&second).unwrap();
        assert!(second_contents.contains("second session"));
        assert!(
            !second_contents.contains("first session"),
            "each session gets its own file"
        );

        let _ = fs::remove_dir_all(&dir);
    }
}
