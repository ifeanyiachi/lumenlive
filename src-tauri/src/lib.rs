mod bible_state;
mod commands;
mod display_watch;
mod events;
mod keep_awake;
mod memstats;
mod setup;
mod state;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file — try src-tauri/.env first, then project root ../.env
    dotenvy::dotenv().ok();
    dotenvy::from_filename("../.env").ok();

    // tauri-plugin-aptabase's setup hook starts its flush loop with a bare
    // `tokio::spawn`, which panics ("there is no reactor running") because
    // Tauri v2 runs plugin setup hooks on the main thread without entering a
    // Tokio context first. Enter Tauri's own runtime context here and hold the
    // guard for the whole launch so that spawn finds a reactor. Harmless when
    // the plugin isn't registered; load-bearing when an Aptabase key is present.
    let rt_handle = tauri::async_runtime::handle();
    let _tokio_guard = rt_handle.inner().enter();

    let mut builder = tauri::Builder::default();

    // Anonymous usage analytics (Aptabase). The App Key is baked into the binary
    // at compile time by build.rs (from APTABASE_KEY / .env) via a generated
    // file — a compile-time value, not a runtime read, because a packaged app
    // has no .env beside it. If it's absent or empty (e.g. a contributor build
    // with no key), the plugin is never registered and nothing is ever sent. The
    // runtime opt-out lives in the frontend analytics gateway, which suppresses
    // events the user has declined.
    let aptabase_key =
        include_str!(concat!(env!("OUT_DIR"), "/aptabase_key.txt")).trim();
    if !aptabase_key.is_empty() {
        builder = builder
            .plugin(tauri_plugin_aptabase::Builder::new(aptabase_key).build());
    }

    builder
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
        // Wake lock: keeps the display + system awake while any broadcast output
        // (external display window or NDI) is live. Self-managing (its own
        // worker thread), so it needs no Mutex. See keep_awake.rs.
        .manage(keep_awake::WakeLock::new())
        // Tracks which monitor each live display output opened on, so the
        // display-watch poller can tear an output down when its screen is
        // unplugged. See commands/broadcast.rs + display_watch.rs.
        .manage(commands::broadcast::OutputMonitors::default())
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
            // Open the control window maximized (config flag is unreliable on
            // Windows; re-issue maximize once the window exists).
            setup::maximize_main_window(app);
            // Ensure closing the main window tears down the projector windows.
            setup::wire_main_window_teardown(app);
            // Watch for a projector/HDMI display being unplugged mid-service and
            // tear the stranded output window down instead of leaving it
            // fullscreen on the operator's screen.
            display_watch::spawn(app.handle());

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
