use tauri::State;

use crate::database::{queries, Database, Bookmark, BookmarkWithVerse};

#[tauri::command]
pub fn create_bookmark(
    db: State<'_, Database>,
    verse_id: i64,
    label: Option<String>,
) -> Result<Bookmark, String> {
    queries::create_bookmark(&db, verse_id, label.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_bookmarks(db: State<'_, Database>) -> Result<Vec<BookmarkWithVerse>, String> {
    queries::get_all_bookmarks(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_bookmark(db: State<'_, Database>, id: i64) -> Result<(), String> {
    queries::delete_bookmark(&db, id).map_err(|e| e.to_string())
}
