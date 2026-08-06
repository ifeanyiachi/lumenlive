//! Bible database access for the `LumenLive` application.
//!
//! Provides SQLite-backed storage and retrieval for Bible translations,
//! books, verses, and cross-references. Supports full-text search via
//! FTS5 with BM25 ranking.
//!
//! # Key types
//!
//! - [`BibleDb`] — connection wrapper for the `SQLite` database
//! - [`Verse`], [`Book`], [`Translation`] — data models
//! - [`BibleError`] — error type for all database operations

pub mod crossref;
pub mod db;
pub mod error;
pub mod import;
pub mod lexicon;
pub mod lookup;
pub mod models;
pub mod registry;
pub mod search;

pub use db::*;
pub use error::*;
pub use import::{
    build_translation_db, extract_sqlite_verses, ImportMeta, ImportStats, ImportVerse,
};
pub use lexicon::{LexiconEntry, OriginalWord};
pub use models::*;
pub use registry::{InstalledRegistry, InstalledTranslation};
pub use search::Bm25Result;
