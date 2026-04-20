use tauri::State;
use crate::database::{Database, IngestResult, queries};

#[tauri::command]
pub fn populate_terms_fts(db: State<Database>) -> Result<IngestResult, String> {
    queries::populate_terms_fts(&db).map_err(|e| e.to_string())
}
