//! Transcript-event processing: consumes `TranscriptEvent`s from the STT
//! provider, emits `transcript_partial`/`transcript_final` to the frontend, and
//! fans finals out to the background detection workers (direct + reading mode,
//! and semantic) without ever blocking transcript delivery.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Emitter};

use lumenlive_stt::TranscriptEvent;

use crate::events::{
    TranscriptPayload, EVENT_TRANSCRIPT_FINAL, EVENT_TRANSCRIPT_PARTIAL,
};

use super::detection::{
    check_navigation_command, check_reading_mode, check_translation_command, run_direct_detection,
    run_semantic_detection,
};
use super::truncate_safe;

/// Spawn the transcript-processing task set: two background detection workers
/// (semantic, and direct+reading) plus the event consumer that drives them. All
/// three run on the tokio runtime; detection work uses `spawn_blocking` so mutex
/// locks / ONNX inference / DB I/O never starve the async runtime (WebSocket
/// readers, event emitters).
#[expect(
    clippy::too_many_lines,
    reason = "single transcript-event consumer loop; per-arm latency flags and \
              queue counters are threaded through one closure, so splitting the \
              match arms would fragment the hot path (cf. run_semantic_detection)"
)]
pub(super) fn spawn_transcript_processing(
    app: &AppHandle,
    mut event_rx: tokio::sync::mpsc::Receiver<TranscriptEvent>,
    stt_active: &Arc<AtomicBool>,
) {
    let evt_active = stt_active.clone();
    let event_app = app.clone();

    // Background semantic detection channel — non-blocking, drops if busy
    let (semantic_tx, mut semantic_rx) = tokio::sync::mpsc::channel::<String>(4);

    // Background detection channel — direct + reading mode, non-blocking. The
    // bool is `is_final`: partials run direct detection only (panel display),
    // finals run the full pipeline (merge, auto-queue, reading mode).
    let (detect_tx, mut detect_rx) = tokio::sync::mpsc::channel::<(String, bool)>(16);

    // [DIAG] Counters so we can see whether transcripts are being dropped
    // because the detection workers can't keep up. Logged every 25 sends
    // alongside current queue depth.
    let detect_sent = Arc::new(AtomicU64::new(0));
    let detect_dropped = Arc::new(AtomicU64::new(0));
    let semantic_sent = Arc::new(AtomicU64::new(0));
    let semantic_dropped = Arc::new(AtomicU64::new(0));

    // Spawn semantic detection worker (runs ONNX inference without blocking transcript).
    // Uses spawn_blocking so ONNX doesn't starve the tokio async runtime
    // (WebSocket readers, event emitters, etc.).
    let sem_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(text) = semantic_rx.recv().await {
            let app_clone = sem_app.clone();
            let _ = tokio::task::spawn_blocking(move || {
                run_semantic_detection(&app_clone, &text);
            })
            .await;
        }
    });

    // Spawn detection worker (runs direct detection + reading mode without blocking
    // transcript delivery). Uses spawn_blocking so mutex locks and DB I/O don't
    // starve the tokio runtime.
    let det_app = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some((transcript, is_final)) = detect_rx.recv().await {
            let app_clone = det_app.clone();
            let _ = tokio::task::spawn_blocking(move || {
                let direct_found = run_direct_detection(&app_clone, &transcript, is_final);
                // Reading-mode advancement fires on finals only: advancing on a
                // volatile partial could jump the reader forward on text that
                // Deepgram later revises.
                if is_final {
                    check_reading_mode(&app_clone, &transcript, direct_found);
                }
            })
            .await;
        }
    });

    let detect_sent_evt = detect_sent.clone();
    let detect_dropped_evt = detect_dropped.clone();
    let semantic_sent_evt = semantic_sent.clone();
    let semantic_dropped_evt = semantic_dropped.clone();

    tauri::async_runtime::spawn(async move {
        // [LATENCY] First-transcript instrumentation. Attributes "slow first
        // transcript" to its real cause by timing the first partial/final
        // against three reference points: session start, the cloud connect, and
        // when the speaker actually started talking. Logged once per session.
        let session_start = Instant::now();
        let mut connected_at: Option<Instant> = None;
        let mut speech_started_at: Option<Instant> = None;
        let mut first_partial_logged = false;
        let mut first_final_logged = false;
        // Last partial text sent to direct detection. Deepgram re-emits the same
        // interim ~1x/sec; skipping unchanged repeats avoids redundant detect()
        // passes. Cleared on each final so the next utterance re-detects.
        let mut last_partial_detect = String::new();

        while let Some(event) = event_rx.recv().await {
            if !evt_active.load(Ordering::SeqCst) {
                break;
            }

            match event {
                TranscriptEvent::Partial { transcript, .. } => {
                    if !transcript.is_empty() {
                        if !first_partial_logged {
                            first_partial_logged = true;
                            let after_connect = connected_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            let after_speech = speech_started_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            log::info!(
                                "[LATENCY] first partial: {:?} after start | {after_connect} after connect | {after_speech} after speech-start",
                                session_start.elapsed()
                            );
                        }
                        let t0 = std::time::Instant::now();
                        let _ = event_app.emit(
                            EVENT_TRANSCRIPT_PARTIAL,
                            TranscriptPayload {
                                text: transcript.clone(),
                                is_final: false,
                                confidence: 0.0,
                            },
                        );

                        // Check for translation commands on partials too (cheap string matching)
                        // This makes translation switching feel instant without waiting for speech_final
                        check_translation_command(&event_app, &transcript);

                        // Detect-on-partials: feed changed partials into the
                        // direct detector so a spoken reference lands in the AI
                        // Detections panel seconds before the utterance's final
                        // arrives. Partials populate the *panel only* (via the
                        // `verse_detections_partial` event, which bypasses the
                        // merger); auto-display to live and auto-queue stay gated
                        // to finals so a later-revised partial can't flicker the
                        // audience screen or arm the anti-flood cooldown. Drop
                        // silently if the worker is busy — the final re-runs it.
                        if transcript != last_partial_detect {
                            last_partial_detect.clone_from(&transcript);
                            let _ = detect_tx.try_send((transcript.clone(), false));
                        }
                        log::debug!("[EVT] Partial processed in {:?}", t0.elapsed());
                    }
                }
                TranscriptEvent::Final {
                    transcript,
                    confidence,
                    speech_final,
                    ..
                } => {
                    if !transcript.is_empty() {
                        if !first_final_logged {
                            first_final_logged = true;
                            let after_connect = connected_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            let after_speech = speech_started_at.map_or_else(
                                || "n/a".to_string(),
                                |t| format!("{:?}", t.elapsed()),
                            );
                            log::info!(
                                "[LATENCY] first final: {:?} after start | {after_connect} after connect | {after_speech} after speech-start",
                                session_start.elapsed()
                            );
                        }
                        let t0 = std::time::Instant::now();
                        // Emit as permanent transcript segment IMMEDIATELY
                        // (never blocked by detection work)
                        let _ = event_app.emit(
                            EVENT_TRANSCRIPT_FINAL,
                            TranscriptPayload {
                                text: transcript.clone(),
                                is_final: true,
                                confidence,
                            },
                        );

                        // Check for translation commands (cheap, <1ms, stays inline)
                        check_translation_command(&event_app, &transcript);

                        // Check for spoken navigation ("next verse" / "previous
                        // verse"). Finals ONLY — navigation isn't idempotent, so
                        // running it on partials would double-advance when the
                        // final repeats the phrase.
                        check_navigation_command(&event_app, &transcript);

                        // A final closes the utterance: reset the partial-dedup
                        // guard so the next utterance's partials re-detect fresh.
                        last_partial_detect.clear();

                        // Fire-and-forget: detection runs in background thread pool.
                        // Event consumer proceeds immediately to next transcript.
                        if let Ok(()) = detect_tx.try_send((transcript.clone(), true)) {
                            let n = detect_sent_evt.fetch_add(1, Ordering::Relaxed) + 1;
                            if n % 25 == 0 {
                                let depth = detect_tx.max_capacity() - detect_tx.capacity();
                                let dropped = detect_dropped_evt.load(Ordering::Relaxed);
                                log::info!(
                                    "[QUEUE] detect_tx sent={n} dropped={dropped} depth={depth}/{}",
                                    detect_tx.max_capacity()
                                );
                            }
                        } else {
                            let d = detect_dropped_evt.fetch_add(1, Ordering::Relaxed) + 1;
                            let sent = detect_sent_evt.load(Ordering::Relaxed);
                            log::warn!(
                                "[QUEUE] detect_tx DROPPED (consumer behind) sent={sent} dropped={d}"
                            );
                        }

                        // Semantic detection runs ONNX vector search (~300-600ms),
                        // so gate it to utterance boundaries (`speech_final`) instead
                        // of every partial fragment. Moonshine/REST set this true on
                        // every Final; Deepgram sets it only at end-of-speech, which
                        // keeps the capacity-bounded semantic channel from backing up.
                        if speech_final {
                            if let Ok(()) = semantic_tx.try_send(transcript.clone()) {
                                let n = semantic_sent_evt.fetch_add(1, Ordering::Relaxed) + 1;
                                if n % 25 == 0 {
                                    let depth = semantic_tx.max_capacity() - semantic_tx.capacity();
                                    let dropped = semantic_dropped_evt.load(Ordering::Relaxed);
                                    log::info!(
                                        "[QUEUE] semantic_tx sent={n} dropped={dropped} depth={depth}/{}",
                                        semantic_tx.max_capacity()
                                    );
                                }
                            } else {
                                let d = semantic_dropped_evt.fetch_add(1, Ordering::Relaxed) + 1;
                                let sent = semantic_sent_evt.load(Ordering::Relaxed);
                                log::warn!(
                                    "[QUEUE] semantic_tx DROPPED (consumer behind) sent={sent} dropped={d}"
                                );
                            }
                        }

                        log::debug!("[EVT] Final processed in {:?} ({:?})", t0.elapsed(), truncate_safe(&transcript, 40));
                    }
                }
                TranscriptEvent::UtteranceEnd => {}
                TranscriptEvent::SpeechStarted => {
                    // Capture the first utterance's onset for latency attribution.
                    if speech_started_at.is_none() {
                        speech_started_at = Some(Instant::now());
                    }
                    let _ = event_app.emit("stt_speech_started", ());
                }
                TranscriptEvent::Error(msg) => {
                    log::error!("[STT] Error: {msg}");
                    let _ = event_app.emit("stt_error", msg);
                }
                TranscriptEvent::Connected => {
                    if connected_at.is_none() {
                        connected_at = Some(Instant::now());
                    }
                    log::info!("[STT] Connected");
                    let _ = event_app.emit("stt_connected", ());
                }
                TranscriptEvent::Disconnected => {
                    log::warn!("[STT] Disconnected");
                    let _ = event_app.emit("stt_disconnected", ());
                }
            }
        }

        log::info!("Transcript event consumer task exited");
    });
}
