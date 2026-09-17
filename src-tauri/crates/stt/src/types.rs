use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Word {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub confidence: f64,
    pub punctuated_word: Option<String>,
}

#[derive(Debug, Clone)]
pub enum TranscriptEvent {
    Partial {
        transcript: String,
        words: Vec<Word>,
    },
    Final {
        transcript: String,
        words: Vec<Word>,
        confidence: f64,
        speech_final: bool,
    },
    UtteranceEnd,
    SpeechStarted,
    Error(String),
    Connected,
    Disconnected,
}

#[derive(Debug, Clone)]
pub struct SttConfig {
    pub api_key: String,
    pub model: String,
    pub sample_rate: u32,
    pub encoding: String,
    pub language: Option<String>,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "nova-3".to_string(),
            sample_rate: 16000,
            encoding: "linear16".to_string(),
            language: None,
        }
    }
}

/// Which STT backend to construct. Deepgram is the default; Soniox is the
/// experimental second backend behind the same [`crate::SttProvider`] trait so
/// the two can be A/B'd on a live service (see `soniox.md`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttBackend {
    Deepgram,
    Soniox,
}

/// Soniox real-time config. Kept separate from [`SttConfig`] so neither provider
/// leaks the other's fields (Soniox has no `encoding`; Deepgram has no
/// `language_hints`). Domain vocabulary is not carried here — the Soniox client
/// builds its `context` payload from [`crate::bible_keyterms`] directly.
#[derive(Debug, Clone)]
pub struct SonioxConfig {
    pub api_key: String,
    /// Real-time model id, e.g. `stt-rt-v5`.
    pub model: String,
    pub sample_rate: u32,
    /// BCP-47 hints (e.g. `["en"]`). Empty = let Soniox auto-detect.
    pub language_hints: Vec<String>,
}

impl Default for SonioxConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "stt-rt-v5".to_string(),
            sample_rate: 16000,
            language_hints: vec!["en".to_string()],
        }
    }
}
