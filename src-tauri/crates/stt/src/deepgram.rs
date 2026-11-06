//! Deepgram Nova-3 streaming over Listen v1 (16 kHz mono PCM).
//! <https://developers.deepgram.com/reference/speech-to-text/listen-streaming>

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crossbeam_channel::{Receiver, TryRecvError};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use tokio::time::{timeout, Instant};
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, Message};

use crate::{bible_keyterms, SttError, SttProvider, TranscriptEvent, Word};

/// Cloud transcription provider. Credentials are held only for this session.
pub struct DeepgramClient {
    api_key: String,
    cancelled: AtomicBool,
}

impl DeepgramClient {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            cancelled: AtomicBool::new(false),
        }
    }

    fn request(
        &self,
    ) -> Result<tokio_tungstenite::tungstenite::handshake::client::Request, SttError> {
        let mut url = url::Url::parse("wss://api.deepgram.com/v1/listen")
            .map_err(|e| SttError::ConnectionFailed(e.to_string()))?;
        {
            let mut query = url.query_pairs_mut();
            query.extend_pairs([
                ("model", "nova-3"),
                ("language", "en"),
                ("encoding", "linear16"),
                ("sample_rate", "16000"),
                ("channels", "1"),
                ("interim_results", "true"),
                ("smart_format", "true"),
                ("numerals", "true"),
                ("vad_events", "true"),
                ("endpointing", "500"),
                ("utterance_end_ms", "1000"),
            ]);
            // Book names and spoken variants come first. Avoid generic cue words
            // and numerals, and stay below Deepgram's 100-term / 500-token limits.
            for term in bible_keyterms().into_iter().take(84) {
                query.append_pair("keyterm", &term);
            }
        }
        let mut request = url
            .as_str()
            .into_client_request()
            .map_err(|e| SttError::ConnectionFailed(e.to_string()))?;
        // The account server may issue a temporary JWT instead of a project key.
        let scheme = if self.api_key.split('.').count() == 3 {
            "Bearer"
        } else {
            "Token"
        };
        let mut auth = HeaderValue::from_str(&format!("{scheme} {}", self.api_key))
            .map_err(|_| SttError::Unauthorized)?;
        auth.set_sensitive(true);
        request.headers_mut().insert("Authorization", auth);
        Ok(request)
    }

    async fn connect_once(
        &self,
        audio_rx: &Receiver<Vec<i16>>,
        event_tx: &mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        let (socket, _) = timeout(
            Duration::from_secs(5),
            tokio_tungstenite::connect_async(self.request()?),
        )
        .await
        .map_err(|_| SttError::ConnectionFailed("Deepgram connection timed out".into()))?
        .map_err(|error| connection_error(&error))?;
        self.stream(socket, audio_rx, event_tx).await
    }

    async fn stream<S>(
        &self,
        socket: tokio_tungstenite::WebSocketStream<S>,
        audio_rx: &Receiver<Vec<i16>>,
        event_tx: &mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError>
    where
        S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin,
    {
        let (mut writer, mut reader) = socket.split();
        let _ = event_tx.send(TranscriptEvent::Connected).await;
        let mut poll = tokio::time::interval(Duration::from_millis(20));
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut last_audio = Instant::now();
        let mut closing: Option<Instant> = None;
        let mut aggregator = DeepgramAggregator::default();
        loop {
            tokio::select! {
                _ = poll.tick() => {
                    if let Some(deadline) = closing {
                        if Instant::now() >= deadline { return Ok(()); }
                        continue;
                    }
                    let mut disconnected = false;
                    let mut bytes = Vec::new();
                    // Bound each pass so receiving transcripts and stop requests
                    // cannot be starved by a continuously producing capture thread.
                    for _ in 0..8 {
                        match audio_rx.try_recv() {
                            Ok(samples) => bytes.extend(samples.iter().flat_map(|s| s.to_le_bytes())),
                            Err(TryRecvError::Empty) => break,
                            Err(TryRecvError::Disconnected) => { disconnected = true; break; }
                        }
                    }
                    if !bytes.is_empty() {
                        send(&mut writer, Message::Binary(bytes.into())).await?;
                        last_audio = Instant::now();
                    }
                    if disconnected || self.cancelled.load(Ordering::SeqCst) {
                        send(&mut writer, Message::Text(r#"{"type":"CloseStream"}"#.into())).await?;
                        // Let Deepgram return the final buffered transcript.
                        closing = Some(Instant::now() + Duration::from_secs(2));
                    } else if last_audio.elapsed() >= Duration::from_secs(3) {
                        send(&mut writer, Message::Text(r#"{"type":"KeepAlive"}"#.into())).await?;
                        last_audio = Instant::now();
                    }
                }
                message = reader.next() => {
                    match message {
                        Some(Ok(Message::Text(text))) => {
                            for event in aggregator.ingest(&text)? {
                                if event_tx.send(event).await.is_err() { return Ok(()); }
                            }
                        }
                        Some(Ok(Message::Ping(payload))) => send(&mut writer, Message::Pong(payload)).await?,
                        Some(Ok(Message::Close(_))) | None => {
                            return if closing.is_some() || self.cancelled.load(Ordering::SeqCst) {
                                Ok(())
                            } else {
                                Err(SttError::ConnectionFailed("Deepgram stream closed unexpectedly".into()))
                            };
                        }
                        Some(Err(error)) => return Err(connection_error(&error)),
                        Some(Ok(_)) => {}
                    }
                }
            }
        }
    }
}

async fn send<S>(writer: &mut S, message: Message) -> Result<(), SttError>
where
    S: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    timeout(Duration::from_secs(2), writer.send(message))
        .await
        .map_err(|_| SttError::SendError("Deepgram send timed out".into()))?
        .map_err(|error| connection_error(&error))
}

fn connection_error(error: &tokio_tungstenite::tungstenite::Error) -> SttError {
    if let tokio_tungstenite::tungstenite::Error::Http(response) = error {
        if matches!(response.status().as_u16(), 401 | 403) {
            return SttError::Unauthorized;
        }
        return SttError::ConnectionFailed(format!("Deepgram HTTP {}", response.status()));
    }
    // Do not include request headers or credentials in errors.
    SttError::ConnectionFailed(error.to_string())
}

#[async_trait::async_trait]
impl SttProvider for DeepgramClient {
    async fn start(
        &self,
        audio_rx: Receiver<Vec<i16>>,
        event_tx: mpsc::Sender<TranscriptEvent>,
    ) -> Result<(), SttError> {
        if self.api_key.is_empty() {
            return Err(SttError::ApiKeyMissing);
        }
        for attempt in 0..2 {
            if self.cancelled.load(Ordering::SeqCst) {
                return Ok(());
            }
            let result = self.connect_once(&audio_rx, &event_tx).await;
            let _ = event_tx.send(TranscriptEvent::Disconnected).await;
            match result {
                Ok(()) => return Ok(()),
                Err(_) if self.cancelled.load(Ordering::SeqCst) => return Ok(()),
                Err(error) if matches!(error, SttError::Unauthorized) || attempt == 1 => {
                    return Err(error)
                }
                Err(_) => tokio::time::sleep(Duration::from_secs(1)).await,
            }
        }
        Ok(())
    }

    fn stop(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
    }
    fn name(&self) -> &'static str {
        "deepgram"
    }
}

#[derive(Deserialize)]
struct Alternative {
    transcript: String,
    #[serde(default)]
    confidence: f64,
    #[serde(default)]
    words: Vec<DeepgramWord>,
}

#[derive(Deserialize)]
struct DeepgramWord {
    word: String,
    start: f64,
    end: f64,
    confidence: f64,
    punctuated_word: Option<String>,
}

/// Nova can finalize several segments before the speaker pauses. Keep those
/// segments together so scripture detection receives the whole utterance, as
/// it does with Soniox, rather than only the last segment before a pause.
#[derive(Default)]
struct DeepgramAggregator {
    transcript: String,
    words: Vec<Word>,
    confidence: f64,
}

impl DeepgramAggregator {
    fn ingest(&mut self, text: &str) -> Result<Vec<TranscriptEvent>, SttError> {
        let mut output = Vec::new();
        for event in parse_events(text)? {
            match event {
                TranscriptEvent::Final {
                    transcript,
                    words,
                    confidence,
                    speech_final,
                } => {
                    self.append(&transcript);
                    self.words.extend(words);
                    self.confidence = confidence;
                    // Bound memory even if the speaker never pauses. A finalized
                    // segment from CloseStream must also be committed promptly.
                    if speech_final || self.words.len() >= 500 || self.transcript.len() >= 16_000 {
                        output.extend(self.finish(speech_final));
                    } else {
                        output.push(TranscriptEvent::Partial {
                            transcript: self.transcript.clone(),
                            words: self.words.clone(),
                        });
                    }
                }
                TranscriptEvent::Partial { transcript, words } => {
                    let mut combined_words = self.words.clone();
                    combined_words.extend(words);
                    output.push(TranscriptEvent::Partial {
                        transcript: if self.transcript.is_empty() {
                            transcript
                        } else {
                            format!("{} {transcript}", self.transcript)
                        },
                        words: combined_words,
                    });
                }
                TranscriptEvent::UtteranceEnd => {
                    output.extend(self.finish(true));
                    output.push(TranscriptEvent::UtteranceEnd);
                }
                other => output.push(other),
            }
        }
        Ok(output)
    }

    fn append(&mut self, text: &str) {
        if !self.transcript.is_empty() {
            self.transcript.push(' ');
        }
        self.transcript.push_str(text);
    }

    fn finish(&mut self, speech_final: bool) -> Option<TranscriptEvent> {
        if self.transcript.is_empty() {
            return None;
        }
        Some(TranscriptEvent::Final {
            transcript: std::mem::take(&mut self.transcript),
            words: std::mem::take(&mut self.words),
            confidence: self.confidence,
            speech_final,
        })
    }
}

fn parse_events(text: &str) -> Result<Vec<TranscriptEvent>, SttError> {
    let frame: serde_json::Value =
        serde_json::from_str(text).map_err(|e| SttError::ParseError(e.to_string()))?;
    let event = match frame["type"].as_str() {
        Some("Results") => {
            let alternative: Alternative =
                serde_json::from_value(frame["channel"]["alternatives"][0].clone())
                    .map_err(|e| SttError::ParseError(e.to_string()))?;
            let speech_final = frame["speech_final"].as_bool().unwrap_or(false)
                || frame["from_finalize"].as_bool().unwrap_or(false);
            if alternative.transcript.trim().is_empty() {
                return Ok(if speech_final {
                    vec![TranscriptEvent::UtteranceEnd]
                } else {
                    vec![]
                });
            }
            let words = alternative
                .words
                .into_iter()
                .map(|word| Word {
                    text: word.word,
                    start: word.start,
                    end: word.end,
                    confidence: word.confidence,
                    punctuated_word: word.punctuated_word,
                })
                .collect();
            if frame["is_final"].as_bool().unwrap_or(false) {
                TranscriptEvent::Final {
                    transcript: alternative.transcript,
                    words,
                    confidence: alternative.confidence,
                    speech_final,
                }
            } else {
                TranscriptEvent::Partial {
                    transcript: alternative.transcript,
                    words,
                }
            }
        }
        Some("UtteranceEnd") => TranscriptEvent::UtteranceEnd,
        Some("SpeechStarted") => TranscriptEvent::SpeechStarted,
        Some("Error") => {
            return Err(SttError::ConnectionFailed(
                "Deepgram reported a stream error".into(),
            ))
        }
        _ => return Ok(vec![]),
    };
    Ok(vec![event])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finalized_segments_and_interims_form_one_utterance() {
        let mut aggregator = DeepgramAggregator::default();
        let first = aggregator.ingest(r#"{"type":"Results","is_final":true,"channel":{"alternatives":[{"transcript":"Turn to John"}]}}"#).unwrap();
        assert!(
            matches!(&first[0], TranscriptEvent::Partial { transcript, .. } if transcript == "Turn to John")
        );
        let interim = aggregator.ingest(r#"{"type":"Results","is_final":false,"channel":{"alternatives":[{"transcript":"three sixteen"}]}}"#).unwrap();
        assert!(
            matches!(&interim[0], TranscriptEvent::Partial { transcript, .. } if transcript == "Turn to John three sixteen")
        );
        let final_events = aggregator.ingest(r#"{"type":"Results","is_final":true,"speech_final":true,"channel":{"alternatives":[{"transcript":"3:16."}]}}"#).unwrap();
        assert!(
            matches!(&final_events[0], TranscriptEvent::Final { transcript, speech_final: true, .. } if transcript == "Turn to John 3:16.")
        );
        assert!(matches!(
            aggregator
                .ingest(r#"{"type":"UtteranceEnd"}"#)
                .unwrap()
                .as_slice(),
            [TranscriptEvent::UtteranceEnd]
        ));
    }

    #[test]
    fn utterance_end_flushes_pending_segments_once() {
        let mut aggregator = DeepgramAggregator::default();
        aggregator.ingest(r#"{"type":"Results","is_final":true,"channel":{"alternatives":[{"transcript":"Psalm 23"}]}}"#).unwrap();
        let events = aggregator.ingest(r#"{"type":"UtteranceEnd"}"#).unwrap();
        assert!(matches!(
            events.as_slice(),
            [
                TranscriptEvent::Final {
                    speech_final: true,
                    ..
                },
                TranscriptEvent::UtteranceEnd
            ]
        ));
        assert!(aggregator.transcript.is_empty());
    }

    #[test]
    fn finalize_response_commits_without_an_endpoint() {
        let mut aggregator = DeepgramAggregator::default();
        let events = aggregator.ingest(r#"{"type":"Results","is_final":true,"from_finalize":true,"channel":{"alternatives":[{"transcript":"Amen"}]}}"#).unwrap();
        assert!(matches!(
            events.as_slice(),
            [TranscriptEvent::Final {
                speech_final: true,
                ..
            }]
        ));
    }

    async fn socket_pair() -> (
        tokio_tungstenite::WebSocketStream<tokio::io::DuplexStream>,
        tokio_tungstenite::WebSocketStream<tokio::io::DuplexStream>,
    ) {
        use tokio_tungstenite::tungstenite::protocol::Role;
        let (client, server) = tokio::io::duplex(8192);
        tokio::join!(
            tokio_tungstenite::WebSocketStream::from_raw_socket(client, Role::Client, None),
            tokio_tungstenite::WebSocketStream::from_raw_socket(server, Role::Server, None),
        )
    }

    #[tokio::test]
    async fn streams_pcm_and_drains_final_transcript_on_shutdown() {
        let (socket, mut server) = socket_pair().await;
        let client = DeepgramClient::new("test-key".into());
        let (audio_tx, audio_rx) = crossbeam_channel::bounded(4);
        let (event_tx, mut event_rx) = mpsc::channel(8);
        audio_tx.send(vec![1, -2, 256]).unwrap();
        drop(audio_tx);
        let server_task = async {
            let audio = server.next().await.unwrap().unwrap();
            assert_eq!(audio.into_data().as_ref(), &[1, 0, 254, 255, 0, 1]);
            let close = server.next().await.unwrap().unwrap();
            assert_eq!(close.into_text().unwrap(), r#"{"type":"CloseStream"}"#);
            server.send(Message::Text(r#"{"type":"Results","is_final":true,"speech_final":true,"channel":{"alternatives":[{"transcript":"John 3:16"}]}}"#.into())).await.unwrap();
            server.close(None).await.unwrap();
        };
        let (result, ()) = timeout(Duration::from_secs(3), async {
            tokio::join!(client.stream(socket, &audio_rx, &event_tx), server_task)
        })
        .await
        .unwrap();
        result.unwrap();
        assert!(matches!(
            event_rx.recv().await,
            Some(TranscriptEvent::Connected)
        ));
        assert!(matches!(
            event_rx.recv().await,
            Some(TranscriptEvent::Final {
                speech_final: true,
                ..
            })
        ));
    }

    #[tokio::test]
    async fn unexpected_remote_close_is_an_error() {
        let (socket, mut server) = socket_pair().await;
        let client = DeepgramClient::new("test-key".into());
        let (_audio_tx, audio_rx) = crossbeam_channel::bounded(4);
        let (event_tx, _event_rx) = mpsc::channel(8);
        server.close(None).await.unwrap();
        let result = timeout(
            Duration::from_secs(1),
            client.stream(socket, &audio_rx, &event_tx),
        )
        .await
        .unwrap();
        assert!(matches!(result, Err(SttError::ConnectionFailed(_))));
    }

    #[test]
    fn rejected_credentials_trigger_key_refresh() {
        let response = tokio_tungstenite::tungstenite::http::Response::builder()
            .status(401)
            .body(None)
            .unwrap();
        assert!(matches!(
            connection_error(&tokio_tungstenite::tungstenite::Error::Http(response)),
            SttError::Unauthorized
        ));
    }

    #[test]
    fn request_uses_nova3_and_bounded_bible_keyterms() {
        let request = DeepgramClient::new("test-key".into()).request().unwrap();
        let url = url::Url::parse(&request.uri().to_string()).unwrap();
        let pairs: Vec<_> = url.query_pairs().collect();
        assert!(pairs.iter().any(|(k, v)| k == "model" && v == "nova-3"));
        assert_eq!(pairs.iter().filter(|(k, _)| k == "keyterm").count(), 84);
        assert!(pairs
            .iter()
            .any(|(k, v)| k == "keyterm" && v == "Third John"));
        assert_eq!(request.headers()["Authorization"], "Token test-key");
    }

    #[test]
    fn temporary_tokens_use_bearer_auth() {
        let request = DeepgramClient::new("header.payload.signature".into())
            .request()
            .unwrap();
        assert_eq!(
            request.headers()["Authorization"],
            "Bearer header.payload.signature"
        );
    }

    #[test]
    fn results_preserve_timestamps_punctuation_and_finality() {
        let events = parse_events(r#"{"type":"Results","is_final":true,"speech_final":true,"channel":{"alternatives":[{"transcript":"John 3:16.","confidence":0.98,"words":[{"word":"john","start":1.2,"end":1.5,"confidence":0.99,"punctuated_word":"John"}]}]}}"#).unwrap();
        let TranscriptEvent::Final {
            transcript,
            words,
            confidence,
            speech_final,
        } = &events[0]
        else {
            panic!("expected final")
        };
        assert_eq!(transcript, "John 3:16.");
        assert!((words[0].start - 1.2).abs() < f64::EPSILON);
        assert_eq!(words[0].punctuated_word.as_deref(), Some("John"));
        assert!((*confidence - 0.98).abs() < f64::EPSILON);
        assert!(speech_final);
    }

    #[test]
    fn empty_endpoint_still_releases_detection() {
        let events = parse_events(r#"{"type":"Results","speech_final":true,"channel":{"alternatives":[{"transcript":""}]}}"#).unwrap();
        assert!(matches!(events.as_slice(), [TranscriptEvent::UtteranceEnd]));
    }

    #[test]
    fn interim_and_control_events_are_mapped() {
        assert!(matches!(parse_events(r#"{"type":"Results","is_final":false,"channel":{"alternatives":[{"transcript":"John"}]}}"#).unwrap().as_slice(), [TranscriptEvent::Partial { .. }]));
        assert!(matches!(
            parse_events(r#"{"type":"UtteranceEnd"}"#)
                .unwrap()
                .as_slice(),
            [TranscriptEvent::UtteranceEnd]
        ));
        assert!(matches!(
            parse_events(r#"{"type":"SpeechStarted"}"#)
                .unwrap()
                .as_slice(),
            [TranscriptEvent::SpeechStarted]
        ));
        assert!(parse_events(r#"{"type":"Metadata"}"#).unwrap().is_empty());
        assert!(parse_events(r#"{"type":"Error","description":"bad request"}"#).is_err());
        assert!(parse_events("invalid json").is_err());
    }
}
