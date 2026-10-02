//! Speech-to-text integration for the `LumenLive` application.
//!
//! Provides real-time transcription via **Deepgram** (cloud) — WebSocket
//! streaming with keyword boosting — and, experimentally, **Soniox** behind the
//! same [`SttProvider`] trait so the two can be A/B'd (see `soniox.md`).
//!
//! # Key types
//!
//! - [`SttProvider`] — trait for swappable STT backends
//! - [`SttBackend`] — which backend to construct
//! - [`DeepgramClient`] — Deepgram WebSocket/REST provider
//! - [`SonioxClient`] — Soniox real-time WebSocket provider (experimental)
//! - [`TranscriptEvent`] — streaming transcript events (partial, final, etc.)
//! - [`SttConfig`] / [`SonioxConfig`] — per-backend API configuration
//! - [`SttError`] — error type for STT operations
//!
//! # Feature flags
//!
//! - `rest-fallback` — enables REST API fallback client

pub mod deepgram;
pub mod error;
pub mod keyterms;
pub mod nemotron;
pub mod provider;
pub mod rest;
pub mod soniox;
pub mod types;

pub use deepgram::DeepgramClient;
pub use error::SttError;
pub use keyterms::bible_keyterms;
pub use nemotron::{NemotronClient, NemotronConfig};
pub use provider::SttProvider;
pub use soniox::SonioxClient;
pub use types::{SonioxConfig, SttBackend, SttConfig, TranscriptEvent, Word};
