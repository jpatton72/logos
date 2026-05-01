use directories::ProjectDirs;
use std::path::PathBuf;
use tracing::{error, info, Level};
use tracing_subscriber::fmt::format::FmtSpan;

mod commands;
mod database;
pub mod ai;
pub mod secrets;

use commands::{
    ai_chat, compare_verses, create_bookmark, create_note, delete_api_key, delete_bookmark,
    delete_note, export_notes_and_bookmarks, get_book_index, get_bookmarks, get_chapter,
    get_chapter_counts, get_chapter_originals, get_ketiv_qere, get_notes, get_preference,
    get_reading_progress, get_strongs_greek, get_strongs_hebrew, get_verse, get_verse_words,
    has_api_key, populate_terms_fts, search_notes, search_terms, search_verses, set_api_key,
    set_preference, update_note, update_reading_progress,
};

pub use database::Database;

pub struct AppState {
    pub db: Database,
    pub http: reqwest::Client,
    pub ai_rate_limiter: ai::RateLimiter,
}

/// Resolve the app data directory. Returns ~/.local/share/logos on Unix.
fn get_app_data_dir() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "logos", "Logos") {
        proj_dirs.data_dir().to_path_buf()
    } else {
        // Fallback
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("logos");
        path
    }
}

fn setup_logging(app_data_dir: &PathBuf) {
    let logs_dir = app_data_dir.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "logos.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep the guard alive for the lifetime of the app by leaking it
    std::mem::forget(_guard);

    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(non_blocking)
        .with_ansi(false)
        .init();

    info!("Logos v{} starting up", env!("CARGO_PKG_VERSION"));
    info!("App data directory: {:?}", app_data_dir);
}

fn init_app_state() -> Result<AppState, String> {
    let app_data_dir = get_app_data_dir();
    setup_logging(&app_data_dir);

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir).map_err(|e| {
        error!("Failed to create app data directory: {}", e);
        e.to_string()
    })?;

    // Seed user DB from bundled copy on first run if DB is missing or empty
    let db_path = app_data_dir.join("logos.db");
    let needs_seed = !db_path.exists()
        || db_path.metadata().map(|m| m.len() == 0).unwrap_or(false);
    if needs_seed {
        if let Ok(exe) = std::env::current_exe() {
            let bundle_root = exe.parent().unwrap_or(&exe);
            let bundled = bundle_root.join("logos.db");
            if bundled.exists() {
                match std::fs::copy(&bundled, &db_path) {
                    Ok(_) => info!("Seeded bundled database to {:?}", db_path),
                    Err(e) => info!("No bundled DB available or copy failed: {}", e),
                }
            } else {
                info!("Bundled logos.db not found at {:?}", bundled);
            }
        }
    }

    info!("Initializing database at {:?}", db_path);
    let db = Database::new(&app_data_dir).map_err(|e| {
        error!("Failed to initialize database: {}", e);
        e.to_string()
    })?;

    // Move any plaintext API keys left over from earlier builds into the
    // OS credential vault. Best-effort: a vault outage logs but doesn't
    // block startup.
    secrets::migrate_api_keys_from_preferences(&db);

    let http = ai::build_http_client().map_err(|e| {
        error!("Failed to build HTTP client: {}", e);
        e.to_string()
    })?;

    let ai_rate_limiter = ai::RateLimiter::from_env();

    Ok(AppState { db, http, ai_rate_limiter })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = match init_app_state() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("FATAL: Failed to initialize app state: {}", e);
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // .plugin(tauri_plugin_updater::Builder::new().build())  // DISABLED: needs write access to target dir
        .manage(app_state.db)
        .manage(app_state.http)
        .manage(app_state.ai_rate_limiter)
        .invoke_handler(tauri::generate_handler![
            get_verse,
            get_chapter,
            get_book_index,
            get_chapter_counts,
            search_verses,
            search_terms,
            create_bookmark,
            get_bookmarks,
            delete_bookmark,
            create_note,
            get_notes,
            update_note,
            delete_note,
            search_notes,
            export_notes_and_bookmarks,
            get_strongs_greek,
            get_strongs_hebrew,
            get_verse_words,
            get_chapter_originals,
            get_ketiv_qere,
            get_preference,
            set_preference,
            compare_verses,
            populate_terms_fts,
            ai_chat,
            set_api_key,
            has_api_key,
            delete_api_key,
            get_reading_progress,
            update_reading_progress,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
