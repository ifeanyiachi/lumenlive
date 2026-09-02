//! App startup wiring, extracted from `run()`'s `.setup(...)` closure.
//!
//! Failure policy (R3):
//!   - **Bible DB missing** → degrade gracefully (warn, continue; scripture
//!     features are simply unavailable until a DB is installed).
//!   - **Bible DB present but corrupt / unopenable** → **refuse to start** with a
//!     clear error (returning `Err` from setup aborts launch) rather than the old
//!     unhelpful `.expect(...)` panic or booting into a half-broken state.
//!   - **Semantic model/index missing or unloadable** → degrade (semantic search
//!     disabled); it is an optional enhancement, not required to run a service.

use std::sync::Mutex;

use tauri::Manager;

use crate::bible_state;

type SetupResult = Result<(), Box<dyn std::error::Error>>;

/// Resolve the Bible DB path, open it, run the FTS5 health check, publish it to
/// the managed `BibleState`, and re-attach any previously downloaded
/// translations. A missing DB degrades; a corrupt DB aborts startup.
pub fn init_bible_db(app: &tauri::App) -> SetupResult {
    // Try resource dir first (production), then dev fallback
    let db_path = app
        .path()
        .resource_dir()
        .map(|p| p.join("lumenlive.db"))
        .ok()
        .filter(|p| p.exists())
        .unwrap_or_else(|| {
            std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("../data/lumenlive.db")
        });

    if !db_path.exists() {
        // Missing DB is a graceful-degrade case: the app still runs, scripture
        // features are just unavailable until one is installed.
        log::warn!("Bible database not found at {}", db_path.display());
        return Ok(());
    }

    // Present-but-corrupt is NOT recoverable: refuse to start with a clear error
    // instead of panicking (old `.expect`) or booting broken.
    let bible_db = match lumenlive_bible::BibleDb::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            log::error!(
                "Bible database at {} could not be opened: {e}",
                db_path.display()
            );
            return Err(format!(
                "The Bible database at {} appears to be corrupt and could not be opened ({e}). \
                 LumenLive cannot start without a valid Bible database — please reinstall or \
                 restore it.",
                db_path.display()
            )
            .into());
        }
    };

    // Health check: run a real query before committing the DB. `BibleDb::open`
    // has a read-only fallback that can succeed on a corrupt file WITHOUT
    // validating it, so a failure here is our reliable "opened but corrupt"
    // signal — refuse to start (corrupt-DB policy) rather than boot broken.
    match bible_db.search_verses_bm25("God loved world", 3) {
        Ok(results) => log::info!("FTS5 health check: {} results", results.len()),
        Err(e) => {
            log::error!(
                "Bible database health check failed at {}: {e}",
                db_path.display()
            );
            return Err(format!(
                "The Bible database at {} opened but failed a basic query ({e}), which means it \
                 is corrupt or incomplete. LumenLive cannot start without a valid Bible database \
                 — please reinstall or restore it.",
                db_path.display()
            )
            .into());
        }
    }

    {
        let managed_bible = app.state::<Mutex<bible_state::BibleState>>();
        let mut bible = managed_bible.lock().map_err(|e| {
            format!("Bible state lock was poisoned during startup: {e}")
        })?;
        bible.db = Some(bible_db);
    }
    log::info!("Bible database loaded from {}", db_path.display());

    // Re-attach any previously downloaded translations so the resource-store
    // installs survive restarts. Each lives in its own file under
    // app_data_dir()/bibles and is indexed by the registry; a missing/corrupt
    // file (or a poisoned lock here) is logged and skipped rather than aborting
    // startup.
    if let Ok(app_data) = app.path().app_data_dir() {
        let bibles_dir = app_data.join("bibles");
        let registry_path = bibles_dir.join("installed-translations.json");
        match lumenlive_bible::InstalledRegistry::load(&registry_path) {
            Ok(registry) => {
                let managed_bible = app.state::<Mutex<bible_state::BibleState>>();
                let Ok(bible) = managed_bible.lock() else {
                    log::warn!("Bible state lock poisoned while re-attaching translations — skipped");
                    return Ok(());
                };
                if let Some(db) = bible.db.as_ref() {
                    for entry in &registry.translations {
                        let path = bibles_dir.join(&entry.file_name);
                        if !path.exists() {
                            log::warn!(
                                "Downloaded translation file missing: {}",
                                path.display()
                            );
                            continue;
                        }
                        match db.attach_translation(entry.global_id, &path) {
                            Ok(_) => log::info!(
                                "Attached downloaded translation '{}' (id {})",
                                entry.resource_id,
                                entry.global_id
                            ),
                            Err(e) => log::warn!(
                                "Failed to attach translation '{}': {e}",
                                entry.resource_id
                            ),
                        }
                    }
                }
            }
            Err(e) => log::warn!("Failed to load install registry: {e}"),
        }
    }

    Ok(())
}

/// bge-base-en-v1.5's retrieval instruction, prepended to runtime query text
/// (the query side of the asymmetric prefix contract; verses get no prefix).
const BGE_QUERY_PREFIX: &str = "Represent this sentence for searching relevant passages: ";

/// Which on-device embedding model backs semantic search. Both are INT8 ONNX
/// models paired with a pre-computed KJV verse index built by the matching
/// precompute script; a query and its index must come from the **same** model or
/// similarities are computed across mismatched subspaces.
///
/// This is a runtime A/B switch (see the `set_embedding_model` command): the
/// operator flips between the two to compare detection quality on real speech,
/// then the losing model is removed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum EmbeddingModel {
    /// BAAI/bge-base-en-v1.5, 768-dim, **asymmetric** (queries carry
    /// [`BGE_QUERY_PREFIX`], verses none). The wired startup default.
    Bge,
    /// Qwen3-Embedding-0.6B, 1024-dim, **symmetric** (no prefix on either side).
    Qwen,
}

/// Static asset layout + prefix contract for one [`EmbeddingModel`].
struct ModelAssets {
    /// INT8 ONNX model file, relative to the resource/dev base.
    model_rel: &'static str,
    /// `HuggingFace` tokenizer.json, relative to the base.
    tokenizer_rel: &'static str,
    /// Pre-computed flat-f32 verse embeddings, relative to the base.
    embeddings_rel: &'static str,
    /// Matching i64 verse-id sidecar, relative to the base.
    ids_rel: &'static str,
    /// Prepended to every runtime query (empty = symmetric). Verses are always
    /// embedded prefix-free by the precompute script.
    query_prefix: &'static str,
}

impl EmbeddingModel {
    /// Parse the frontend's model id (`"bge"` / `"qwen"`); `None` if unknown.
    pub(crate) fn parse(s: &str) -> Option<Self> {
        match s {
            "bge" => Some(Self::Bge),
            "qwen" => Some(Self::Qwen),
            _ => None,
        }
    }

    /// The stable string id shared with the frontend settings store.
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Bge => "bge",
            Self::Qwen => "qwen",
        }
    }

    fn assets(self) -> ModelAssets {
        match self {
            Self::Bge => ModelAssets {
                model_rel: "models/bge-base-en-v1.5-int8/model_quantized.onnx",
                tokenizer_rel: "models/bge-base-en-v1.5-int8/tokenizer.json",
                embeddings_rel: "embeddings/kjv-bge-base-en-v1.5.bin",
                ids_rel: "embeddings/kjv-bge-base-en-v1.5-ids.bin",
                query_prefix: BGE_QUERY_PREFIX,
            },
            // The Qwen downloader (data/download-model.ts) keeps the tokenizer
            // inside the self-contained int8 dir, so both model and tokenizer
            // resolve there. Qwen is symmetric — no query prefix.
            Self::Qwen => ModelAssets {
                model_rel: "models/qwen3-embedding-0.6b-int8/model_quantized.onnx",
                tokenizer_rel: "models/qwen3-embedding-0.6b-int8/tokenizer.json",
                embeddings_rel: "embeddings/kjv-qwen3-0.6b.bin",
                ids_rel: "embeddings/kjv-qwen3-0.6b-ids.bin",
                query_prefix: "",
            },
        }
    }
}

/// Resolve a bundled asset: prefer the packaged resource dir (production), fall
/// back to the source-tree path (dev). `CARGO_MANIFEST_DIR` is a build-machine
/// compile-time path, so an installed app must find assets under `res_base`.
fn resolve_asset(res_base: Option<&std::path::Path>, rel: &str) -> std::path::PathBuf {
    if let Some(rb) = res_base {
        let p = rb.join(rel);
        if p.exists() {
            return p;
        }
    }
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join(rel)
}

/// Build a [`SemanticDetector`](lumenlive_detection::SemanticDetector) for
/// `model`: load its INT8 embedder (with the correct query prefix) and its
/// pre-computed verse index. Shared by startup ([`init_semantic`]) and the
/// runtime `set_embedding_model` switch.
///
/// Returns `Err` with an operator-facing message when the model or its index is
/// missing/unloadable — the caller surfaces it (startup logs it and degrades;
/// the command forwards it to the UI so the user knows to generate the assets).
pub(crate) fn build_semantic_detector(
    res_base: Option<&std::path::Path>,
    model: EmbeddingModel,
) -> Result<lumenlive_detection::SemanticDetector, String> {
    // Traits for `embedder.dimension()` / `index.len()`; declared before any
    // statement per clippy::items_after_statements.
    use lumenlive_detection::semantic::embedder::TextEmbedder;
    use lumenlive_detection::semantic::index::VectorIndex;

    let assets = model.assets();
    let model_path = resolve_asset(res_base, assets.model_rel);
    let tokenizer_path = resolve_asset(res_base, assets.tokenizer_rel);
    let embeddings_path = resolve_asset(res_base, assets.embeddings_rel);
    let ids_path = resolve_asset(res_base, assets.ids_rel);

    if !(model_path.exists() && tokenizer_path.exists()) {
        return Err(format!(
            "{} model files not found (expected {} + tokenizer). Generate them first, then retry.",
            model.as_str(),
            assets.model_rel,
        ));
    }

    // Both models are loaded via the query-side constructor: bge gets its
    // retrieval instruction; qwen gets an empty prefix (symmetric). The
    // pre-computed index is prefix-free either way — see the prefix contract on
    // `OnnxEmbedder`.
    let embedder = lumenlive_detection::OnnxEmbedder::load_with_prefix(
        &model_path,
        &tokenizer_path,
        assets.query_prefix,
    )
    .map_err(|e| format!("failed to load {} model: {e}", model.as_str()))?;

    // Warm-up inference: pay the ORT cold-start cost (arena allocation +
    // thread-pool spin-up) here rather than on the operator's first spoken
    // phrase. Non-fatal — a real query would resurface any genuine error.
    let warm_start = std::time::Instant::now();
    match embedder.embed("for god so loved the world") {
        Ok(_) => log::info!(
            "[{}] ONNX warm-up embed complete in {:?}",
            model.as_str(),
            warm_start.elapsed()
        ),
        Err(e) => log::warn!(
            "[{}] ONNX warm-up embed failed (non-fatal): {e}",
            model.as_str()
        ),
    }

    if !(embeddings_path.exists() && ids_path.exists()) {
        return Err(format!(
            "{} verse index not found (expected {}). Run the precompute step for this model.",
            model.as_str(),
            assets.embeddings_rel,
        ));
    }

    let dim = embedder.dimension();
    let index =
        lumenlive_detection::HnswVectorIndex::load(&embeddings_path, &ids_path, dim)
            .map_err(|e| format!("failed to load {} verse index: {e}", model.as_str()))?;
    log::info!(
        "[{}] semantic detector ready: {} vectors x {dim} dims",
        model.as_str(),
        index.len(),
    );

    Ok(lumenlive_detection::SemanticDetector::new(
        Box::new(embedder),
        Box::new(index),
    ))
}

/// Load the **default** embedding model and its verse index into the managed
/// `DetectionPipeline` at startup. Every failure here degrades (semantic search
/// disabled) — it is an optional enhancement, so this never aborts startup. The
/// operator can switch models at runtime via the `set_embedding_model` command,
/// which the frontend re-applies from its persisted choice shortly after boot.
pub fn init_semantic(app: &tauri::App) {
    let res_base = app.path().resource_dir().ok();
    let detector = match build_semantic_detector(res_base.as_deref(), EmbeddingModel::Bge) {
        Ok(detector) => detector,
        Err(e) => {
            log::info!("Semantic search disabled: {e}");
            return;
        }
    };
    log::info!("Semantic search ready ({} vectors)", detector.index_len());

    let managed_pipeline = app.state::<Mutex<lumenlive_detection::DetectionPipeline>>();
    let Ok(mut pipeline) = managed_pipeline.lock() else {
        log::warn!("DetectionPipeline lock poisoned during startup — semantic search disabled");
        return;
    };
    pipeline.set_semantic(detector);
}

/// Force the main control window to open maximized (filling the work area).
///
/// The window config declares `"maximized": true`, but on Windows that flag is
/// applied unreliably at creation time — depending on monitor/DPI timing the
/// window can land at its default 1280×800 size, offset rather than centered.
/// Re-issuing `maximize()` here, after the window exists, is the reliable path
/// and makes both `tauri dev` and production builds open filling the screen.
pub fn maximize_main_window(app: &tauri::App) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    if let Err(e) = main.maximize() {
        log::warn!("Failed to maximize main window: {e}");
    }
}

/// Tear the whole app down when the operator closes the main control window.
///
/// The broadcast output windows are borderless, non-closable and hidden from the
/// taskbar/alt-tab, so the operator can't dismiss them by hand — without this
/// they linger fullscreen on the projector and keep the process alive (previously
/// only a reboot cleared them). On the main window's close request we stop NDI
/// (releasing its network senders), destroy every secondary window, then exit so
/// the process terminates cleanly.
pub fn wire_main_window_teardown(app: &tauri::App) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    let app_handle = app.handle().clone();
    main.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
            if let Some(runtime) =
                app_handle.try_state::<Mutex<lumenlive_broadcast::ndi::NdiRuntime>>()
            {
                if let Ok(mut rt) = runtime.lock() {
                    rt.stop_all();
                }
            }
            for (label, window) in app_handle.webview_windows() {
                if label != "main" {
                    let _ = window.destroy();
                }
            }
            app_handle.exit(0);
        }
    });
}

#[cfg(test)]
mod tests {
    /// The corrupt-DB refuse-to-start (decision #4) hinges on a corrupt file being
    /// *detected* — either `BibleDb::open` errors, or (because the read-only
    /// fallback can open a bad file) the health-check query errors. Prove a garbage
    /// file trips at least one of those, so `init_bible_db` would return its Err.
    #[test]
    fn corrupt_db_is_detected() {
        let path = std::env::temp_dir()
            .join(format!("lumenlive-corrupt-{}.db", std::process::id()));
        std::fs::write(&path, b"this is definitely not a sqlite database").unwrap();

        let detected = match lumenlive_bible::BibleDb::open(&path) {
            // Opened (read-only fallback) — the health-check query must fail.
            Ok(db) => db.search_verses_bm25("God loved world", 3).is_err(),
            // Open itself rejected it — also a refuse-to-start trigger.
            Err(_) => true,
        };

        let _ = std::fs::remove_file(&path);
        assert!(
            detected,
            "a corrupt Bible DB must fail open() or the health-check query"
        );
    }
}
