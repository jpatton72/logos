use serde::Serialize;
use tauri::State;

use crate::database::{queries, Database, Note};

#[derive(Serialize)]
pub struct PaginatedNotes {
    pub items: Vec<Note>,
    pub total: i64,
}

#[tauri::command]
pub fn create_note(
    db: State<'_, Database>,
    verse_id: Option<i64>,
    title: Option<String>,
    content: String,
    tags: Vec<String>,
) -> Result<Note, String> {
    queries::create_note(&db, verse_id, title.as_deref(), &content, tags.iter().map(|s| s.as_str()).collect())
        .map_err(|e| e.to_string())
}

/// Page of notes plus the total count for that filter.
/// `limit` defaults to 100; pass 0 for unbounded (used by the export
/// command).
#[tauri::command]
pub fn get_notes(
    db: State<'_, Database>,
    verse_id: Option<i64>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<PaginatedNotes, String> {
    let effective_limit = limit.or(Some(100));
    let items = queries::get_notes(&db, verse_id, effective_limit, offset)
        .map_err(|e| e.to_string())?;
    let total = queries::count_notes(&db, verse_id).map_err(|e| e.to_string())?;
    Ok(PaginatedNotes { items, total })
}

#[tauri::command]
pub fn update_note(
    db: State<'_, Database>,
    id: i64,
    title: Option<String>,
    content: String,
    tags: Vec<String>,
) -> Result<Note, String> {
    queries::update_note(&db, id, title.as_deref(), &content, tags.iter().map(|s| s.as_str()).collect()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_note(db: State<'_, Database>, id: i64) -> Result<(), String> {
    queries::delete_note(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_notes(db: State<'_, Database>, query: String) -> Result<Vec<Note>, String> {
    queries::search_notes(&db, &query).map_err(|e| e.to_string())
}
