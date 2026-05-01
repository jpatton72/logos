use tauri::State;

use crate::database::{queries, Database, EnglishStrongsResult, StrongsGreek, StrongsHebrew, WordMapping};

#[tauri::command]
pub fn get_strongs_greek(db: State<'_, Database>, id: String) -> Result<Option<StrongsGreek>, String> {
    queries::get_strongs_greek(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_strongs_hebrew(db: State<'_, Database>, id: String) -> Result<Option<StrongsHebrew>, String> {
    queries::get_strongs_hebrew(&db, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_verse_words(db: State<'_, Database>, verse_id: i64) -> Result<Vec<WordMapping>, String> {
    queries::get_verse_words(&db, verse_id).map_err(|e| e.to_string())
}

/// Returns ranked Strong's candidates for an English word, drawn from
/// the KJV2006 word-tagged ingest. `limit` defaults to 25.
#[tauri::command]
pub fn lookup_english_term(
    db: State<'_, Database>,
    term: String,
    limit: Option<u32>,
) -> Result<Vec<EnglishStrongsResult>, String> {
    queries::lookup_english_term(&db, &term, limit.unwrap_or(25)).map_err(|e| e.to_string())
}
