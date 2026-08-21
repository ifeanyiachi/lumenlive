mod bible_state;
mod commands;
mod events;
mod memstats;
mod setup;
mod state;

use std::sync::Mutex;

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            commands::broadcast::focus_broadcast_window,
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
            memstats::spawn();

            // A missing Bible DB degrades gracefully; a corrupt one refuses to
            // start (the `?` propagates a clear error and aborts launch).
            setup::init_bible_db(app)?;
            // Semantic search is optional — never aborts startup.
            setup::init_semantic(app);
            // Ensure closing the main window tears down the projector windows.
            setup::wire_main_window_teardown(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
