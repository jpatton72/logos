use tauri::State;

use crate::database::{queries, Database};

#[tauri::command]
pub fn get_reading_progress(
    db: State<'_, Database>,
) -> Result<Vec<queries::ReadingProgressEntry>, String> {
    queries::get_reading_progress(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_reading_progress(
    db: State<'_, Database>,
    book_id: i64,
    chapter: i32,
) -> Result<(), String> {
    queries::update_reading_progress(&db, book_id, chapter).map_err(|e| e.to_string())
}
