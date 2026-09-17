//! Soniox real-time STT provider (experimental — A/B against Deepgram).
//!
//! Implements [`SttProvider`] over Soniox's real-time WebSocket API so the
//! command layer and detection pipeline are unchanged. See `soniox.md` for the
//! evaluation and phased plan.
//!
//! # Protocol (locked from docs 2026-09-14)
//! - endpoint `wss://stt-rt.soniox.com/transcribe-websocket`
//! - auth: `api_key` inside the **first JSON config frame** (no header)
//! - audio: raw `pcm_s16le` binary frames; `sample_rate`/`num_channels` in config
//! - end-of-stream: an **empty message**
//! - responses: `{ tokens:[{text,is_final,start_ms?,end_ms?,confidence?}],
//!   final_audio_proc_ms, total_audio_proc_ms, finished, error_code?,
//!   error_message? }`
//!
//! # Mapping Soniox tokens → [`TranscriptEvent`] (the load-bearing part)
//! Soniox marks `is_final` **per token** and refines a non-final tail as audio
//! arrives; Deepgram marks it **per utterance**. Downstream (`events.rs`) expects
//! Deepgram's shape: `Partial` = the full current interim utterance, `Final` = a
//! complete committed segment, `speech_final`/`UtteranceEnd` = the boundary that
//! releases semantic detection. [`SonioxAggregator`] bridges the two: it
//! accumulates finalized tokens per utterance, emits a cumulative `Partial` each
//! frame, and emits `Final` + `UtteranceEnd` when Soniox signals an endpoint.
//!
//! # Assumptions still pending Phase 0 (`soniox.md`) — all isolated here:
//! 1. **Delta finals.** We assume each frame carries newly-final tokens once
//!    (not the whole running set re-sent). If Soniox re-sends cumulatively, the
//!    accumulation in [`SonioxAggregator::ingest`] double-counts — fix there.
//! 2. **Endpoint marker.** We treat a token whose text is `<end>` as the
//!    utterance boundary ([`is_endpoint_marker`]). Confirm against the frame dump.
//! 3. **Number formatting** (`John three sixteen` → `3:16`) is Soniox's job, not
//!    the aggregator's. If Phase 0 shows word-form numbers, a spoken-number→digit
//!    normalizer goes where the `Final`/`Partial` transcripts are produced.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use crossbeam_channel::Receiver;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

use crate::error::SttError;
use crate::keyterms::bible_keyterms;
use crate::provider::SttProvider;
use crate::types::{SonioxConfig, TranscriptEvent, Word};

const WS_URL: &str = "wss://stt-rt.soniox.com/transcribe-websocket";
/// Soniox's endpoint-detection boundary marker token (assumption — see module docs).
const ENDPOINT_MARKER: &str = "<end>";

// Reconnect/latency knobs mirror the Deepgram client so operator-facing failure
// behaviour is identical across backends.
const MAX_RECONNECT_ATTEMPTS: u32 = 2;
const RECONNECT_DELAY: Duration = Duration::from_secs(1);
const CONNECT_TIMEOUT: Duration = Duration::from_millis(1500);
/// 100 ms of 16 kHz audio (1600 samples). Small so partials stream promptly;
/// Soniox bills per audio-second regardless of chunk size.
const BATCH_SAMPLES: usize = 1600;

pub struct SonioxClient {
    config: SonioxConfig,
    cancelled: Arc<AtomicBool>,
}

impl std::fmt::Debug for SonioxClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SonioxClient")
            .field("model", &self.config.model)
            .finish_non_exhaustive()
    }
}

impl SonioxClient {
    #[must_use]
    pub fn new(config: SonioxConfig) -> Self {
        Self {
            config,
            cancelled: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Build the first WebSocket frame: JSON config carrying the key, model, raw
    /// audio format, and the full Bible `context` (no 100-term cap — Soniox
    /// allows ~8k tokens, so the entire keyterm list ships).
    fn build_config_message(&self) -> String {
        let terms = bible_keyterms();
        let context = serde_json::json!({
            "general": [
                { "key": "domain", "value": "Christian church service" },
                { "key": "topic", "value": "scripture reading and preaching" }
            ],
            "text": "Live church service. Speakers announce Bible references such \
                     as 'John 3:16', 'First Corinthians 13:4', 'Psalm 23'. Prefer \
                     digit form for chapter and verse numbers.",
            "terms": terms,
        });
        serde_json::json!({
            "api_key": self.config.api_key,
            "model": self.config.model,
            "audio_format": "pcm_s16le",
            "sample_rate": self.config.sample_rate,
            "num_channels": 1,
            "language_hints": self.config.language_hints,
            "enable_endpoint_detection": true,
            "context": context,
        })
        .to_string()
    }

    /// Connect and stream, retrying transient drops. A rejected key fails fast.
    async fn connect(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        if self.config.api_key.is_empty() {
            return Err(SttError::ApiKeyMissing);
        }

        let cancelled = self.cancelled.clone();
        let mut attempts: u32 = 0;

        loop {
            if cancelled.load(Ordering::SeqCst) {
                log::info!("SonioxClient: cancelled, stopping connection loop");
                break;
            }

            match self
                .try_connect(audio_rx.clone(), event_tx.clone(), cancelled.clone())
                .await
            {
                Ok(()) => {
                    log::info!("SonioxClient: connection closed normally");
                    break;
                }
                Err(e) => {
                    if matches!(e, SttError::Unauthorized) {
                        log::error!("SonioxClient: API key rejected");
                        let _ = event_tx.send(TranscriptEvent::Disconnected).await;
                        return Err(e);
                    }

                    attempts += 1;
                    log::warn!(
                        "SonioxClient: connection error (attempt {attempts}/{MAX_RECONNECT_ATTEMPTS}): {e}",
                    );
                    let _ = event_tx.send(TranscriptEvent::Disconnected).await;

                    if attempts >= MAX_RECONNECT_ATTEMPTS {
                        log::error!("SonioxClient: max reconnection attempts reached");
                        return Err(e);
                    }
                    tokio::time::sleep(RECONNECT_DELAY).await;
                }
            }
        }

        Ok(())
    }

    /// One WebSocket connection: send config, stream audio, parse token frames.
    #[allow(clippy::too_many_lines)]
    async fn try_connect(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
        cancelled: Arc<AtomicBool>,
    ) -> Result<(), SttError> {
        let (ws_stream, _response) =
            match tokio::time::timeout(CONNECT_TIMEOUT, tokio_tungstenite::connect_async(WS_URL))
                .await
            {
                Ok(Ok(pair)) => pair,
                Ok(Err(e)) => return Err(SttError::ConnectionFailed(e.to_string())),
                Err(_elapsed) => {
                    return Err(SttError::ConnectionFailed(
                        "connect timed out (network unreachable)".into(),
                    ))
                }
            };

        log::info!("SonioxClient: connected");
        let (mut write, mut read) = ws_stream.split();

        // Config MUST be the first frame; Soniox validates the key here (auth is
        // surfaced later as an error frame, not an HTTP 401 on the handshake).
        let config_msg = self.build_config_message();
        if let Err(e) = write.send(Message::Text(config_msg.into())).await {
            return Err(SttError::ConnectionFailed(format!("config send failed: {e}")));
        }
        let _ = event_tx.send(TranscriptEvent::Connected).await;

        let send_cancelled = cancelled.clone();
        let recv_cancelled = cancelled.clone();

        let send_error_flag = Arc::new(AtomicBool::new(false));
        let recv_error_flag = Arc::new(AtomicBool::new(false));
        let unauthorized_flag = Arc::new(AtomicBool::new(false));
        let send_err = send_error_flag.clone();
        let recv_err = recv_error_flag.clone();
        let unauthorized = unauthorized_flag.clone();

        // Same two-stage sender as the Deepgram client: a blocking thread drains
        // the crossbeam audio channel into a tokio channel, and an async task
        // writes to the socket — so the blocking recv never starves the runtime.
        #[allow(clippy::items_after_statements)]
        enum WsCommand {
            Audio(Vec<u8>),
            Close,
        }
        let (ws_tx, mut ws_rx) = tokio::sync::mpsc::channel::<WsCommand>(64);

        let audio_reader = {
            let ws_tx = ws_tx.clone();
            let cancelled = send_cancelled.clone();
            tokio::task::spawn_blocking(move || {
                let mut batch_buf: Vec<u8> = Vec::with_capacity(BATCH_SAMPLES * 2);
                let batch_byte_threshold = BATCH_SAMPLES * 2;

                loop {
                    if cancelled.load(Ordering::SeqCst) {
                        let _ = ws_tx.blocking_send(WsCommand::Close);
                        break;
                    }

                    match audio_rx.recv_timeout(Duration::from_millis(50)) {
                        Ok(samples) => {
                            for sample in &samples {
                                batch_buf.extend_from_slice(&sample.to_le_bytes());
                            }
                            if batch_buf.len() >= batch_byte_threshold {
                                let data = std::mem::take(&mut batch_buf);
                                if ws_tx.blocking_send(WsCommand::Audio(data)).is_err() {
                                    break;
                                }
                            }
                        }
                        Err(crossbeam_channel::RecvTimeoutError::Timeout) => {
                            // Flush partial batch. No keep-alive frame: an empty
                            // message is Soniox's end-of-stream signal, and live
                            // capture delivers continuous audio anyway.
                            if !batch_buf.is_empty() {
                                let data = std::mem::take(&mut batch_buf);
                                if ws_tx.blocking_send(WsCommand::Audio(data)).is_err() {
                                    break;
                                }
                            }
                        }
                        Err(crossbeam_channel::RecvTimeoutError::Disconnected) => {
                            if !batch_buf.is_empty() {
                                let data = std::mem::take(&mut batch_buf);
                                let _ = ws_tx.blocking_send(WsCommand::Audio(data));
                            }
                            let _ = ws_tx.blocking_send(WsCommand::Close);
                            break;
                        }
                    }
                }
            })
        };

        let ws_writer = tokio::spawn(async move {
            while let Some(cmd) = ws_rx.recv().await {
                match cmd {
                    WsCommand::Audio(data) => {
                        if let Err(e) = write.send(Message::Binary(data.into())).await {
                            log::error!("SonioxClient ws_writer: send error: {e}");
                            send_err.store(true, Ordering::SeqCst);
                            break;
                        }
                    }
                    WsCommand::Close => {
                        // Empty message = end-of-stream for Soniox.
                        let _ = write.send(Message::Binary(Vec::new().into())).await;
                        let _ = write.close().await;
                        break;
                    }
                }
            }
        });

        // Raw-frame debug dump (opt-in via `SONIOX_DEBUG_FRAMES=1`): appends one
        // JSON line per received text frame to `<temp>/soniox-frames.jsonl`. Off
        // by default = zero cost. Lets a real service answer the endpoint-marker
        // and delta-vs-cumulative questions (soniox.md Q2) without the throwaway
        // spike — the aggregator otherwise consumes frames internally, so a wrong
        // assumption is invisible in the `[TRANSCRIPT]` logs.
        let dump_frames = std::env::var("SONIOX_DEBUG_FRAMES")
            .is_ok_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
        let dump_path = std::env::temp_dir().join("soniox-frames.jsonl");

        let receiver = tokio::spawn(async move {
            let mut aggregator = SonioxAggregator::default();
            let mut frame_dump = if dump_frames {
                match std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&dump_path)
                {
                    Ok(f) => {
                        log::info!(
                            "SonioxClient: frame dump enabled -> {}",
                            dump_path.display()
                        );
                        Some(f)
                    }
                    Err(e) => {
                        log::warn!(
                            "SonioxClient: frame dump open failed ({}): {e}",
                            dump_path.display()
                        );
                        None
                    }
                }
            } else {
                None
            };
            while let Some(msg_result) = read.next().await {
                if recv_cancelled.load(Ordering::SeqCst) {
                    break;
                }
                match msg_result {
                    Ok(Message::Text(text)) => {
                        if let Some(file) = frame_dump.as_mut() {
                            use std::io::Write as _;
                            // Best-effort: a dump write failure must never disrupt
                            // the live transcript path.
                            let _ = writeln!(file, "{text}");
                        }

                        let json: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(j) => j,
                            Err(e) => {
                                log::warn!("SonioxClient receiver: parse error: {e}");
                                continue;
                            }
                        };

                        if json.get("error_code").is_some() || json.get("error_message").is_some() {
                            if is_auth_error(&json) {
                                log::error!("SonioxClient: auth error frame: {json}");
                                unauthorized.store(true, Ordering::SeqCst);
                            } else {
                                log::warn!("SonioxClient: server error frame: {json}");
                            }
                            recv_err.store(true, Ordering::SeqCst);
                            break;
                        }

                        for ev in aggregator.ingest(&json) {
                            if event_tx.send(ev).await.is_err() {
                                break;
                            }
                        }

                        if json
                            .get("finished")
                            .and_then(serde_json::Value::as_bool)
                            .unwrap_or(false)
                        {
                            log::info!("SonioxClient receiver: server finished");
                            break;
                        }
                    }
                    Ok(Message::Close(_)) => {
                        log::info!("SonioxClient receiver: server closed connection");
                        break;
                    }
                    Ok(_) => { /* ignore binary/ping/pong */ }
                    Err(e) => {
                        log::warn!("SonioxClient receiver: WebSocket error: {e}");
                        recv_err.store(true, Ordering::SeqCst);
                        break;
                    }
                }
            }
        });

        let _ = tokio::join!(audio_reader, ws_writer, receiver);

        if unauthorized_flag.load(Ordering::SeqCst) {
            return Err(SttError::Unauthorized);
        }
        if send_error_flag.load(Ordering::SeqCst) || recv_error_flag.load(Ordering::SeqCst) {
            return Err(SttError::ConnectionFailed(
                "Connection lost unexpectedly".into(),
            ));
        }
        Ok(())
    }

    pub fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
}

/// True when a server error frame indicates a rejected key (vs a transient
/// failure). Deliberately broad; refine once Phase 0 captures the exact
/// `error_code` for a bad key.
fn is_auth_error(msg: &serde_json::Value) -> bool {
    if let Some(code) = msg.get("error_code") {
        if let Some(n) = code.as_i64() {
            if n == 401 || n == 403 {
                return true;
            }
        }
        if let Some(s) = code.as_str() {
            let s = s.to_ascii_lowercase();
            if s.contains("auth") || s.contains("api_key") || s.contains("unauthor") {
                return true;
            }
        }
    }
    if let Some(m) = msg.get("error_message").and_then(|v| v.as_str()) {
        let m = m.to_ascii_lowercase();
        return m.contains("api key")
            || m.contains("unauthor")
            || m.contains("authenticat")
            || m.contains("invalid key");
    }
    false
}

fn is_endpoint_marker(text: &str) -> bool {
    text == ENDPOINT_MARKER
}

/// Convert one Soniox token to a [`Word`]. Timestamps are milliseconds in the
/// wire format; [`Word`] is seconds.
fn token_to_word(token: &serde_json::Value) -> Word {
    let text = token
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let start = token
        .get("start_ms")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.0)
        / 1000.0;
    let end = token
        .get("end_ms")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(0.0)
        / 1000.0;
    let confidence = token
        .get("confidence")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(1.0);
    Word {
        text,
        start,
        end,
        confidence,
        punctuated_word: None,
    }
}

/// Stateful bridge from Soniox's per-token stream to Deepgram-shaped
/// [`TranscriptEvent`]s. One per connection; lives in the receiver task.
///
/// See the module docs for the three assumptions this encodes.
#[derive(Default)]
struct SonioxAggregator {
    /// Raw text of finalized tokens for the current utterance (keeps spacing).
    committed_text: String,
    committed_words: Vec<Word>,
    conf_sum: f64,
    conf_n: u32,
    /// Whether we've emitted `SpeechStarted` for the current utterance.
    utterance_active: bool,
}

impl SonioxAggregator {
    /// Fold one token frame into the running utterance, returning the
    /// `TranscriptEvent`s to emit (in order).
    fn ingest(&mut self, msg: &serde_json::Value) -> Vec<TranscriptEvent> {
        let mut events = Vec::new();
        let Some(tokens) = msg.get("tokens").and_then(|v| v.as_array()) else {
            return events;
        };
        if tokens.is_empty() {
            return events;
        }

        let mut endpoint = false;
        let mut nonfinal_text = String::new();
        let mut nonfinal_words: Vec<Word> = Vec::new();
        let mut saw_content = false;

        for token in tokens {
            let raw = token.get("text").and_then(|v| v.as_str()).unwrap_or("");
            let is_final = token
                .get("is_final")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(false);

            if is_endpoint_marker(raw) {
                endpoint = true;
                continue;
            }
            if raw.is_empty() {
                continue;
            }
            saw_content = true;

            if is_final {
                self.committed_text.push_str(raw);
                if let Some(c) = token.get("confidence").and_then(serde_json::Value::as_f64) {
                    self.conf_sum += c;
                    self.conf_n += 1;
                }
                self.committed_words.push(token_to_word(token));
            } else {
                nonfinal_text.push_str(raw);
                nonfinal_words.push(token_to_word(token));
            }
        }

        // Utterance onset → SpeechStarted (parity with Deepgram vad_events).
        if !self.utterance_active && saw_content {
            self.utterance_active = true;
            events.push(TranscriptEvent::SpeechStarted);
        }

        // Cumulative interim: full current-utterance text. Downstream dedups
        // unchanged repeats, so re-emitting the running text each frame is fine.
        if saw_content {
            let transcript = format!("{}{nonfinal_text}", self.committed_text)
                .trim()
                .to_string();
            let mut words = self.committed_words.clone();
            words.extend(nonfinal_words);
            events.push(TranscriptEvent::Partial { transcript, words });
        }

        if endpoint {
            let final_text = self.committed_text.trim().to_string();
            if !final_text.is_empty() {
                let confidence = if self.conf_n > 0 {
                    self.conf_sum / f64::from(self.conf_n)
                } else {
                    1.0
                };
                events.push(TranscriptEvent::Final {
                    transcript: final_text,
                    words: self.committed_words.clone(),
                    confidence,
                    speech_final: true,
                });
            }
            events.push(TranscriptEvent::UtteranceEnd);
            self.reset();
        }

        events
    }

    fn reset(&mut self) {
        self.committed_text.clear();
        self.committed_words.clear();
        self.conf_sum = 0.0;
        self.conf_n = 0;
        self.utterance_active = false;
    }
}

#[async_trait::async_trait]
impl SttProvider for SonioxClient {
    async fn start(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        self.cancelled.store(false, Ordering::SeqCst);
        self.connect(audio_rx, event_tx).await
    }

    fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }

    fn name(&self) -> &'static str {
        "soniox"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Collapse events into compact tags for readable assertions.
    fn tags(events: &[TranscriptEvent]) -> Vec<&'static str> {
        events
            .iter()
            .map(|e| match e {
                TranscriptEvent::Partial { .. } => "Partial",
                TranscriptEvent::Final { .. } => "Final",
                TranscriptEvent::UtteranceEnd => "UtteranceEnd",
                TranscriptEvent::SpeechStarted => "SpeechStarted",
                TranscriptEvent::Error(_) => "Error",
                TranscriptEvent::Connected => "Connected",
                TranscriptEvent::Disconnected => "Disconnected",
            })
            .collect()
    }

    fn partial_text(event: &TranscriptEvent) -> &str {
        match event {
            TranscriptEvent::Partial { transcript, .. } => transcript,
            _ => panic!("not a Partial"),
        }
    }

    fn final_of(events: &[TranscriptEvent]) -> (&str, f64, bool) {
        for e in events {
            if let TranscriptEvent::Final {
                transcript,
                confidence,
                speech_final,
                ..
            } = e
            {
                return (transcript, *confidence, *speech_final);
            }
        }
        panic!("no Final event");
    }

    #[test]
    fn single_frame_all_final_with_endpoint() {
        let mut agg = SonioxAggregator::default();
        let events = agg.ingest(&json!({
            "tokens": [
                { "text": "John ", "is_final": true, "start_ms": 0, "end_ms": 300, "confidence": 0.9 },
                { "text": "3:16", "is_final": true, "start_ms": 300, "end_ms": 600, "confidence": 0.8 },
                { "text": ENDPOINT_MARKER, "is_final": true }
            ]
        }));

        assert_eq!(tags(&events), ["SpeechStarted", "Partial", "Final", "UtteranceEnd"]);
        assert_eq!(partial_text(&events[1]), "John 3:16");
        let (text, conf, speech_final) = final_of(&events);
        assert_eq!(text, "John 3:16");
        assert!(speech_final);
        assert!((conf - 0.85).abs() < 1e-9, "avg confidence, got {conf}");
    }

    #[test]
    fn digits_pass_through_unchanged() {
        // Number formatting is Soniox's job; the aggregator must not mangle it.
        let mut agg = SonioxAggregator::default();
        let events = agg.ingest(&json!({
            "tokens": [
                { "text": "1 Corinthians ", "is_final": true },
                { "text": "13:4", "is_final": true },
                { "text": ENDPOINT_MARKER, "is_final": true }
            ]
        }));
        assert_eq!(final_of(&events).0, "1 Corinthians 13:4");
    }

    #[test]
    fn accumulates_across_frames_final_only_at_endpoint() {
        let mut agg = SonioxAggregator::default();

        let a = agg.ingest(&json!({ "tokens": [{ "text": "the ", "is_final": false }] }));
        assert_eq!(tags(&a), ["SpeechStarted", "Partial"]);
        assert_eq!(partial_text(&a[1]), "the");

        // Non-final "the" is confirmed; a new non-final tail arrives.
        let b = agg.ingest(&json!({
            "tokens": [
                { "text": "the ", "is_final": true },
                { "text": "word", "is_final": false }
            ]
        }));
        assert_eq!(tags(&b), ["Partial"]); // no second SpeechStarted
        assert_eq!(partial_text(&b[0]), "the word");

        let c = agg.ingest(&json!({
            "tokens": [
                { "text": "word", "is_final": true },
                { "text": ENDPOINT_MARKER, "is_final": true }
            ]
        }));
        assert_eq!(tags(&c), ["Partial", "Final", "UtteranceEnd"]);
        assert_eq!(final_of(&c).0, "the word");
    }

    #[test]
    fn ms_to_seconds_conversion() {
        let mut agg = SonioxAggregator::default();
        let events = agg.ingest(&json!({
            "tokens": [{ "text": "Amen", "is_final": true, "start_ms": 1500, "end_ms": 2250 }]
        }));
        let TranscriptEvent::Partial { words, .. } = &events[1] else {
            panic!("expected Partial");
        };
        assert_eq!(words.len(), 1);
        assert!((words[0].start - 1.5).abs() < 1e-9);
        assert!((words[0].end - 2.25).abs() < 1e-9);
        assert_eq!(words[0].text, "Amen");
    }

    #[test]
    fn new_utterance_re_emits_speech_started() {
        let mut agg = SonioxAggregator::default();
        agg.ingest(&json!({
            "tokens": [{ "text": "one", "is_final": true }, { "text": ENDPOINT_MARKER, "is_final": true }]
        }));
        // After the endpoint reset, the next utterance starts fresh.
        let next = agg.ingest(&json!({ "tokens": [{ "text": "two", "is_final": false }] }));
        assert_eq!(tags(&next), ["SpeechStarted", "Partial"]);
        assert_eq!(partial_text(&next[1]), "two");
    }

    #[test]
    fn empty_or_tokenless_frame_yields_nothing() {
        let mut agg = SonioxAggregator::default();
        assert!(agg.ingest(&json!({ "final_audio_proc_ms": 100 })).is_empty());
        assert!(agg.ingest(&json!({ "tokens": [] })).is_empty());
    }

    #[test]
    fn auth_error_detection() {
        assert!(is_auth_error(&json!({ "error_code": 401 })));
        assert!(is_auth_error(&json!({ "error_code": "unauthorized" })));
        assert!(is_auth_error(&json!({ "error_message": "Invalid API key" })));
        assert!(!is_auth_error(&json!({ "error_code": 500, "error_message": "internal" })));
    }
}
