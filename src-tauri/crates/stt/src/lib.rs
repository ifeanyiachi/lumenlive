//! Speech-to-text integration for the `LumenLive` application.
//!
//! Provides real-time transcription via **Soniox** and **Deepgram Nova-3**
//! (cloud, WebSocket streaming with keyword boosting) and **Nemotron** (on-device), behind the same
//! [`SttProvider`] trait so the backend can be swapped per session.
//!
//! # Key types
//!
//! - [`SttProvider`] — trait for swappable STT backends
//! - [`SttBackend`] — which backend to construct
//! - [`SonioxClient`] — Soniox real-time WebSocket provider (cloud)
//! - [`NemotronClient`] — on-device streaming provider
//! - [`TranscriptEvent`] — streaming transcript events (partial, final, etc.)
//! - [`SonioxConfig`] / [`NemotronConfig`] — per-backend configuration
//! - [`SttError`] — error type for STT operations

pub mod error;
pub mod deepgram;
pub mod keyterms;
pub mod nemotron;
pub mod provider;
pub mod soniox;
pub mod types;

pub use error::SttError;
pub use deepgram::DeepgramClient;
pub use keyterms::bible_keyterms;
pub use nemotron::{NemotronClient, NemotronConfig};
pub use provider::SttProvider;
pub use soniox::SonioxClient;
pub use types::{SonioxConfig, SttBackend, TranscriptEvent, Word};
