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

/// Load the ONNX embedding model and pre-computed verse index into the managed
/// `DetectionPipeline`. Every failure here degrades (semantic search disabled) —
/// it is an optional enhancement, so this never aborts startup.
pub fn init_semantic(app: &tauri::App) {
    // Traits for `embedder.dimension()` / `index.len()`; declared before any
    // statement per clippy::items_after_statements.
    use lumenlive_detection::semantic::embedder::TextEmbedder;
    use lumenlive_detection::semantic::index::VectorIndex;

    // Resolve each asset from the bundled resource dir (production) first,
    // falling back to the source-tree path (dev). CARGO_MANIFEST_DIR is a
    // compile-time path that only exists on the build machine, so an installed
    // app must find these under resource_dir().
    let dev_base = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..");
    let res_base = app.path().resource_dir().ok();
    let resolve = |rel: &str| -> std::path::PathBuf {
        if let Some(rb) = &res_base {
            let p = rb.join(rel);
            if p.exists() {
                return p;
            }
        }
        dev_base.join(rel)
    };
    // The app uses the INT8 quantized Qwen3 embedding model exclusively: it is the
    // only variant bundled into the installer (tauri.conf.json) and the
    // pre-computed verse index is embedded with the same model, so query and index
    // share one subspace. The FP32 export exists only transiently as the
    // quantization source during setup and is never loaded at runtime. A missing
    // model is handled by the exists() guard below (semantic search is disabled).
    let model_path = resolve("models/qwen3-embedding-0.6b-int8/model_quantized.onnx");
    let tokenizer_path = resolve("models/qwen3-embedding-0.6b-int8/tokenizer.json");
    let embeddings_path = resolve("embeddings/kjv-qwen3-0.6b.bin");
    let ids_path = resolve("embeddings/kjv-qwen3-0.6b-ids.bin");

    if !(model_path.exists() && tokenizer_path.exists()) {
        log::info!("ONNX model not found. Semantic search disabled. Run 'bun run download:model' to download.");
        return;
    }

    let embedder = match lumenlive_detection::OnnxEmbedder::load(&model_path, &tokenizer_path) {
        Ok(embedder) => {
            log::info!("ONNX embedding model loaded");
            embedder
        }
        Err(e) => {
            log::warn!("Failed to load ONNX model: {e}");
            return;
        }
    };

    // Warm-up inference: the first `embed()` after load pays the ORT cold-start
    // cost (arena allocation + thread-pool spin-up), which would otherwise land
    // on the operator's first spoken phrase. Pay it here at startup instead. The
    // result is discarded; a failure is non-fatal (the real query would surface
    // the same error) and never disables semantic search.
    let warm_start = std::time::Instant::now();
    match embedder.embed("for god so loved the world") {
        Ok(_) => log::info!("ONNX warm-up embed complete in {:?}", warm_start.elapsed()),
        Err(e) => log::warn!("ONNX warm-up embed failed (non-fatal): {e}"),
    }

    // Qwen3-Embedding uses a symmetric no-prefix contract: verse embeddings are
    // pre-computed with no prefix, so live query text must also carry no prefix
    // (any prefix would place queries in a different subspace than the verses).
    // The prefix knob was removed from OnnxEmbedder so this can no longer drift.
    let managed_pipeline = app.state::<Mutex<lumenlive_detection::DetectionPipeline>>();
    let Ok(mut pipeline) = managed_pipeline.lock() else {
        log::warn!("DetectionPipeline lock poisoned during startup — semantic search disabled");
        return;
    };

    // If pre-computed embeddings exist, load the vector index
    if embeddings_path.exists() && ids_path.exists() {
        let dim = embedder.dimension();
        match lumenlive_detection::HnswVectorIndex::load(&embeddings_path, &ids_path, dim) {
            Ok(index) => {
                log::info!("Verse embeddings loaded ({} vectors)", index.len());
                pipeline.set_semantic(lumenlive_detection::SemanticDetector::new(
                    Box::new(embedder),
                    Box::new(index),
                ));
            }
            Err(e) => {
                log::warn!("Failed to load verse embeddings: {e}");
            }
        }
    } else {
        log::info!("No pre-computed verse embeddings found. Run 'bun run export:verses' then the precompute binary.");
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
