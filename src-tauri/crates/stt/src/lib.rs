//! Speech-to-text integration for the `LumenLive` application.
//!
//! Provides real-time transcription via **Deepgram** (cloud) — WebSocket
//! streaming with keyword boosting.
//!
//! # Key types
//!
//! - [`SttProvider`] — trait for swappable STT backends
//! - [`DeepgramClient`] — Deepgram WebSocket/REST provider
//! - [`TranscriptEvent`] — streaming transcript events (partial, final, etc.)
//! - [`SttConfig`] — API configuration
//! - [`SttError`] — error type for STT operations
//!
//! # Feature flags
//!
//! - `rest-fallback` — enables REST API fallback client

pub mod deepgram;
pub mod error;
pub mod keyterms;
pub mod provider;
pub mod rest;
pub mod types;

pub use deepgram::DeepgramClient;
pub use error::SttError;
pub use keyterms::bible_keyterms;
pub use provider::SttProvider;
pub use types::{SttConfig, TranscriptEvent, Word};
