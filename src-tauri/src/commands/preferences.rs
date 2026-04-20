use tauri::State;

use crate::database::{queries, Database};

#[tauri::command]
pub fn get_preference(db: State<'_, Database>, key: String) -> Result<Option<String>, String> {
    queries::get_preference(&db, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_preference(db: State<'_, Database>, key: String, value: String) -> Result<(), String> {
    queries::set_preference(&db, &key, &value).map_err(|e| e.to_string())
}
