use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tracing::{error, info};

use crate::database::migrations::run_migrations;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(data_dir: &PathBuf) -> Result<Self, rusqlite::Error> {
        // Ensure data directory exists
        std::fs::create_dir_all(data_dir).map_err(|e| {
            error!("Failed to create data directory: {}", e);
            rusqlite::Error::InvalidPath(data_dir.clone())
        })?;

        let db_path = data_dir.join("aletheia.db");
        info!("Opening database at: {:?}", db_path);

        let conn = Connection::open(&db_path)?;

        // --- Performance PRAGMAs ---
        // WAL mode: better concurrency, concurrent reads during writes
        conn.execute_batch("
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA busy_timeout = 5000;
            PRAGMA cache_size = -20000;
            PRAGMA mmap_size = 268435456;
            PRAGMA foreign_keys = ON;
        ")?;

        // Run migrations
        run_migrations(&conn)?;

        info!("Database initialized successfully");
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }
}
