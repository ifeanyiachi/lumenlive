mod bible_state;
mod commands;
mod events;
mod memstats;
mod state;

use std::sync::Mutex;

#[expect(clippy::too_many_lines, reason = "app setup is inherently complex")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file — try src-tauri/.env first, then project root ../.env
    dotenvy::dotenv().ok();
    dotenvy::from_filename("../.env").ok();
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Mutex::new(state::AppState::new()))
        .manage(Mutex::new(bible_state::BibleState::new()))
        .manage(Mutex::new(lumenlive_detection::DetectionPipeline::new()))
        .manage(Mutex::new(lumenlive_broadcast::ndi::NdiRuntime::default()))
        .manage(Mutex::new(lumenlive_detection::DirectDetector::new()))
        .manage(Mutex::new(lumenlive_detection::DetectionMerger::new()))
        .manage(Mutex::new(lumenlive_detection::ReadingMode::new()))
        .manage(Mutex::new(commands::remote::OscRuntime::new()))
        .manage(Mutex::new(commands::remote::HttpRuntime::new()))
        .invoke_handler(tauri::generate_handler![
            commands::bible::list_translations,
            commands::bible::list_books,
            commands::bible::get_chapter,
            commands::bible::get_verse,
            commands::bible::search_verses,
            commands::bible::get_translation_verses_for_search,
            commands::bible::get_cross_references,
            commands::bible::get_active_translation,
            commands::bible::set_active_translation,
            commands::bible::get_verse_words,
            commands::bible::get_lexicon_entry,
            commands::bible::get_annotated_verse,
            commands::detection::detect_verses,
            commands::detection::detection_status,
            commands::detection::semantic_search,
            commands::detection::toggle_paraphrase_detection,
            commands::detection::reading_mode_status,
            commands::detection::stop_reading_mode,
            commands::detection::update_detection_settings,
            commands::audio::get_audio_devices,
            commands::stt::start_transcription,
            commands::stt::stop_transcription,
            commands::broadcast::list_monitors,
            commands::broadcast::ensure_broadcast_window,
            commands::broadcast::open_broadcast_window,
            commands::broadcast::close_broadcast_window,
            commands::broadcast::start_ndi,
            commands::broadcast::stop_ndi,
            commands::broadcast::get_ndi_status,
            commands::broadcast::push_ndi_frame,
            commands::remote::start_osc,
            commands::remote::stop_osc,
            commands::remote::get_osc_status,
            commands::remote::start_http,
            commands::remote::stop_http,
            commands::remote::get_http_status,
            commands::remote::update_remote_status,
            commands::media::import_media_files,
            commands::media::copy_media_to_library,
            commands::media::save_media_bytes,
            commands::media::generate_thumbnail,
            commands::resource_store::store_fetch_manifest,
            commands::resource_store::store_install_bible,
            commands::resource_store::store_remove_bible,
            commands::resource_store::store_list_installed,
            commands::bible_import::import_bible_verses,
            commands::bible_import::import_bible_sqlite,
            commands::song_search::song_search_online,
            commands::song_search::song_fetch_lyrics,
            commands::song_pack::song_fetch_pack,
        ])
        .setup(|app| {
            use tauri::Manager;

            memstats::spawn();

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

            if db_path.exists() {
                let bible_db = lumenlive_bible::BibleDb::open(&db_path)
                    .expect("Failed to open Bible database");

                // Verify FTS5 is working before committing the database
                match bible_db.search_verses_bm25("God loved world", 3) {
                    Ok(results) => log::info!("FTS5 health check: {} results", results.len()),
                    Err(e) => log::error!("FTS5 health check FAILED: {e} — semantic detection will not work"),
                }

                let managed_bible = app.state::<Mutex<bible_state::BibleState>>();
                let mut bible = managed_bible.lock().unwrap();
                bible.db = Some(bible_db);
                drop(bible);
                log::info!("Bible database loaded from {}", db_path.display());

                // Re-attach any previously downloaded translations so the
                // resource-store installs survive restarts. Each lives in its
                // own file under app_data_dir()/bibles and is indexed by the
                // registry; a missing/corrupt file is logged and skipped rather
                // than aborting startup.
                if let Ok(app_data) = app.path().app_data_dir() {
                    let bibles_dir = app_data.join("bibles");
                    let registry_path = bibles_dir.join("installed-translations.json");
                    match lumenlive_bible::InstalledRegistry::load(&registry_path) {
                        Ok(registry) => {
                            let managed_bible = app.state::<Mutex<bible_state::BibleState>>();
                            let bible = managed_bible.lock().unwrap();
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
            } else {
                log::warn!("Bible database not found at {}", db_path.display());
            }

            // Try to load ONNX embedding model and pre-computed verse index.
            // Prefer INT8 quantized model (~571MB) over FP32 (~2.4GB).
            //
            // Resolve each asset from the bundled resource dir (production) first,
            // falling back to the source-tree path (dev). CARGO_MANIFEST_DIR is a
            // compile-time path that only exists on the build machine, so an
            // installed app must find these under resource_dir().
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
            // The app uses the INT8 quantized Qwen3 embedding model exclusively:
            // it is the only variant bundled into the installer (tauri.conf.json)
            // and the pre-computed verse index is embedded with the same model,
            // so query and index share one subspace. The FP32 export exists only
            // transiently as the quantization source during setup and is never
            // loaded at runtime. A missing model is handled by the exists() guard
            // below (semantic search is simply disabled).
            let model_path = resolve("models/qwen3-embedding-0.6b-int8/model_quantized.onnx");
            let tokenizer_path = resolve("models/qwen3-embedding-0.6b-int8/tokenizer.json");
            let embeddings_path = resolve("embeddings/kjv-qwen3-0.6b.bin");
            let ids_path = resolve("embeddings/kjv-qwen3-0.6b-ids.bin");

            if model_path.exists() && tokenizer_path.exists() {
                use lumenlive_detection::semantic::embedder::TextEmbedder;
                use lumenlive_detection::semantic::index::VectorIndex;
                match lumenlive_detection::OnnxEmbedder::load(&model_path, &tokenizer_path) {
                    Ok(embedder) => {
                        log::info!("ONNX embedding model loaded");
                        // Qwen3-Embedding uses a symmetric no-prefix contract: verse
                        // embeddings are pre-computed with no prefix, so live query text
                        // must also carry no prefix (any prefix would place queries in a
                        // different subspace than the verses). The prefix knob was removed
                        // from OnnxEmbedder so this can no longer drift.
                        let managed_pipeline = app.state::<Mutex<lumenlive_detection::DetectionPipeline>>();
                        let mut pipeline = managed_pipeline.lock().unwrap();

                        // If pre-computed embeddings exist, load the vector index
                        if embeddings_path.exists() && ids_path.exists() {
                            let dim = embedder.dimension();
                            match lumenlive_detection::HnswVectorIndex::load(&embeddings_path, &ids_path, dim) {
                                Ok(index) => {
                                    log::info!("Verse embeddings loaded ({} vectors)", index.len());
                                    pipeline.set_semantic(
                                        lumenlive_detection::SemanticDetector::new(
                                            Box::new(embedder),
                                            Box::new(index),
                                        ),
                                    );
                                }
                                Err(e) => {
                                    log::warn!("Failed to load verse embeddings: {e}");
                                }
                            }
                        } else {
                            log::info!("No pre-computed verse embeddings found. Run 'bun run export:verses' then the precompute binary.");
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to load ONNX model: {e}");
                    }
                }
            } else {
                log::info!("ONNX model not found. Semantic search disabled. Run 'bun run download:model' to download.");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
