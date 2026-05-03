use directories::ProjectDirs;
use std::path::PathBuf;
use tracing::{error, info, Level};
use tracing_subscriber::fmt::format::FmtSpan;

mod commands;
mod database;
pub mod ai;
pub mod audio;
pub mod secrets;

use commands::{
    ai_chat, audio_install_voice, audio_status, audio_synthesize, audio_uninstall, compare_verses,
    create_bookmark, create_note, delete_ai_conversation, delete_api_key, delete_bookmark,
    delete_note, export_notes_and_bookmarks, get_ai_conversation, get_book_index, get_bookmarks,
    get_chapter, get_chapter_counts, get_chapter_english_alignment, get_chapter_originals,
    get_ketiv_qere, get_notes, get_preference, get_reading_progress, get_strongs_greek,
    get_strongs_hebrew, get_verse, get_verse_words, has_api_key, list_ai_conversations,
    lookup_english_term, populate_terms_fts, save_ai_conversation, search_notes, search_terms,
    search_verses, set_api_key, set_preference, update_ai_conversation_title, update_note,
    update_reading_progress,
};

pub use database::Database;

pub struct AppState {
    pub db: Database,
    pub http: reqwest::Client,
    pub ai_rate_limiter: ai::RateLimiter,
}

/// Resolve the app data directory. Returns ~/.local/share/aletheia on Unix.
pub fn get_app_data_dir() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "aletheia", "Aletheia") {
        proj_dirs.data_dir().to_path_buf()
    } else {
        // Fallback
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("aletheia");
        path
    }
}

/// Pre-rename data directory used by builds shipped under the old name.
/// Returned only so the startup migration knows where to look.
fn legacy_logos_data_dir() -> Option<PathBuf> {
    ProjectDirs::from("com", "logos", "Logos").map(|p| p.data_dir().to_path_buf())
}

/// One-time migration: if the old `~/AppData/.../logos/Logos/data` tree
/// exists but the Aletheia tree does not, move user data over so existing
/// installs don't lose their notes/bookmarks/preferences across the
/// rename. The bundled `logos.db` is renamed to `aletheia.db` as part of
/// the move; FTS, schema, and row data are unchanged.
fn migrate_legacy_data_dir(new_dir: &PathBuf) {
    if new_dir.exists() {
        return;
    }
    let Some(old) = legacy_logos_data_dir() else { return };
    if !old.exists() {
        return;
    }
    info!("Migrating user data {:?} -> {:?}", old, new_dir);
    if let Some(parent) = new_dir.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    // Try a rename first (cheap, atomic on the same volume); fall back to
    // copy + remove if that fails (e.g. cross-volume).
    if std::fs::rename(&old, new_dir).is_err() {
        if let Err(e) = copy_dir_recursive(&old, new_dir) {
            error!("Legacy data migration failed: {}", e);
            return;
        }
        let _ = std::fs::remove_dir_all(&old);
    }
    // The DB file kept its old name inside the migrated tree. Rename it
    // so the rest of the app finds it under the new convention.
    let old_db = new_dir.join("logos.db");
    let new_db = new_dir.join("aletheia.db");
    if old_db.exists() && !new_db.exists() {
        if let Err(e) = std::fs::rename(&old_db, &new_db) {
            error!("Failed to rename logos.db -> aletheia.db: {}", e);
        }
    }
}

fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            std::fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

/// Top up data tables that were added in later schema versions and may
/// have been left empty on upgrade installs. The bundled-DB seed only
/// fires when the user has no database yet; users upgrading from older
/// versions get the new tables created by the schema migration but
/// never populated. ATTACH the bundled DB and copy the rows the user
/// is missing, joining on book/chapter/verse_num so verse-id drift
/// between the bundle and the user's DB doesn't matter.
///
/// Idempotent: each table is checked individually and only filled if
/// the user table is empty. Best-effort: any error is logged and
/// swallowed so a missing or corrupt bundle can't block startup.
fn backfill_data_from_bundle(db: &Database) {
    let bundle = match std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join("aletheia.db")))
    {
        Some(p) if p.exists() => p,
        _ => {
            info!("No bundled DB next to the binary; skipping data backfill");
            return;
        }
    };

    let conn = db.conn.lock().unwrap();
    let count = |sql: &str| -> i64 {
        conn.query_row(sql, [], |r| r.get::<_, i64>(0)).unwrap_or(0)
    };
    let needs_alignment = count("SELECT COUNT(*) FROM english_word_alignment") == 0;
    let needs_strongs_index = count("SELECT COUNT(*) FROM english_strongs_index") == 0;

    if !needs_alignment && !needs_strongs_index {
        return;
    }

    // SQLite ATTACH wants the path inline in the SQL. Single-quote-escape
    // any apostrophes so a path like C:\Users\O'Brien\... still parses.
    let bundle_str = bundle.to_string_lossy().replace('\'', "''");
    if let Err(e) = conn.execute(&format!("ATTACH DATABASE '{}' AS bundle", bundle_str), []) {
        error!("backfill: failed to attach bundle DB: {}", e);
        return;
    }

    if needs_alignment {
        match conn.execute(
            "INSERT INTO english_word_alignment (verse_id, tokens)
             SELECT user_v.id, ba.tokens
             FROM bundle.english_word_alignment ba
             JOIN bundle.verses bv ON bv.id = ba.verse_id
             JOIN bundle.books bb ON bb.id = bv.book_id
             JOIN bundle.translations bt ON bt.id = bv.translation_id
             JOIN main.books user_b ON user_b.abbreviation = bb.abbreviation COLLATE NOCASE
             JOIN main.translations user_t ON user_t.abbreviation = bt.abbreviation COLLATE NOCASE
             JOIN main.verses user_v ON user_v.book_id = user_b.id
                                    AND user_v.chapter = bv.chapter
                                    AND user_v.verse_num = bv.verse_num
                                    AND user_v.translation_id = user_t.id
             WHERE NOT EXISTS (
                SELECT 1 FROM main.english_word_alignment ua WHERE ua.verse_id = user_v.id
             )",
            [],
        ) {
            Ok(n) => info!("Backfilled {} english_word_alignment rows from bundle", n),
            Err(e) => error!("backfill english_word_alignment failed: {}", e),
        }
    }

    if needs_strongs_index {
        match conn.execute(
            "INSERT INTO english_strongs_index
                (english_word, strongs_id, language, frequency,
                 sample_book_id, sample_chapter, sample_verse)
             SELECT
                bs.english_word, bs.strongs_id, bs.language, bs.frequency,
                user_b.id, bs.sample_chapter, bs.sample_verse
             FROM bundle.english_strongs_index bs
             LEFT JOIN bundle.books bb ON bb.id = bs.sample_book_id
             LEFT JOIN main.books user_b ON user_b.abbreviation = bb.abbreviation COLLATE NOCASE
             WHERE NOT EXISTS (
                SELECT 1 FROM main.english_strongs_index us
                WHERE us.english_word = bs.english_word AND us.strongs_id = bs.strongs_id
             )",
            [],
        ) {
            Ok(n) => info!("Backfilled {} english_strongs_index rows from bundle", n),
            Err(e) => error!("backfill english_strongs_index failed: {}", e),
        }
    }

    if let Err(e) = conn.execute("DETACH DATABASE bundle", []) {
        error!("backfill: failed to detach bundle DB: {}", e);
    }
}

fn setup_logging(app_data_dir: &PathBuf) {
    let logs_dir = app_data_dir.join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);

    let file_appender = tracing_appender::rolling::daily(&logs_dir, "aletheia.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    // Keep the guard alive for the lifetime of the app by leaking it
    std::mem::forget(_guard);

    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .with_span_events(FmtSpan::CLOSE)
        .with_writer(non_blocking)
        .with_ansi(false)
        .init();

    info!("Aletheia v{} starting up", env!("CARGO_PKG_VERSION"));
    info!("App data directory: {:?}", app_data_dir);
}

fn init_app_state() -> Result<AppState, String> {
    let app_data_dir = get_app_data_dir();
    // Move legacy `logos/Logos` data over before logging fires up so the
    // logs directory inside the migrated tree gets reused.
    migrate_legacy_data_dir(&app_data_dir);
    setup_logging(&app_data_dir);

    // Ensure directory exists
    std::fs::create_dir_all(&app_data_dir).map_err(|e| {
        error!("Failed to create app data directory: {}", e);
        e.to_string()
    })?;

    // Seed user DB from bundled copy on first run if DB is missing or empty
    let db_path = app_data_dir.join("aletheia.db");
    let needs_seed = !db_path.exists()
        || db_path.metadata().map(|m| m.len() == 0).unwrap_or(false);
    if needs_seed {
        if let Ok(exe) = std::env::current_exe() {
            let bundle_root = exe.parent().unwrap_or(&exe);
            let bundled = bundle_root.join("aletheia.db");
            if bundled.exists() {
                match std::fs::copy(&bundled, &db_path) {
                    Ok(_) => info!("Seeded bundled database to {:?}", db_path),
                    Err(e) => info!("No bundled DB available or copy failed: {}", e),
                }
            } else {
                info!("Bundled aletheia.db not found at {:?}", bundled);
            }
        }
    }

    info!("Initializing database at {:?}", db_path);
    let db = Database::new(&app_data_dir).map_err(|e| {
        error!("Failed to initialize database: {}", e);
        e.to_string()
    })?;

    // Upgrade-install backfill: tables added in later schema versions
    // (english_word_alignment in v5, english_strongs_index in v3) are
    // created empty by the schema migration but never populated when
    // the user already had a database from an earlier version — the
    // bundled-DB seed step above only fires when the DB is missing.
    // Top them up from the bundled DB if the corresponding user table
    // is empty. Best-effort: any failure here is logged and swallowed
    // so a missing/corrupt bundle can't brick startup.
    backfill_data_from_bundle(&db);

    // Move any keyring entries left over from the pre-rename `com.logos.app`
    // service into the new `com.aletheia.app` service so existing users
    // don't have to re-paste their API keys after upgrading.
    secrets::migrate_legacy_keyring_entries();

    // Move any plaintext API keys left over from even earlier builds into
    // the OS credential vault. Best-effort: a vault outage logs but
    // doesn't block startup.
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
            get_chapter_english_alignment,
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
            lookup_english_term,
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
            save_ai_conversation,
            list_ai_conversations,
            get_ai_conversation,
            delete_ai_conversation,
            update_ai_conversation_title,
            get_reading_progress,
            update_reading_progress,
            audio_status,
            audio_install_voice,
            audio_synthesize,
            audio_uninstall,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
