use tauri::State;

use crate::database::{queries, Book, Database, KetivQere, Verse, VerseGroup};

#[tauri::command]
pub fn get_verse(
    db: State<Database>,
    book: String,
    chapter: u32,
    verse: u32,
    translation: String,
) -> Result<Option<Verse>, String> {
    queries::get_verse(&db, &book, chapter as i32, verse as i32, &translation)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter(
    db: State<Database>,
    book: String,
    chapter: u32,
    translations: Vec<String>,
) -> Result<Vec<VerseGroup>, String> {
    let trans_refs: Vec<&str> = translations.iter().map(|s| s.as_str()).collect();
    queries::get_chapter(&db, &book, chapter as i32, trans_refs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_book_index(db: State<Database>) -> Result<Vec<Book>, String> {
    queries::get_all_books(&db).map_err(|e| e.to_string())
}

/// Returns a `{ abbreviation: max_chapter }` map for every book that has
/// verses loaded. The frontend caches this once at startup so chapter
/// counts always match the DB instead of a hand-maintained constant.
#[tauri::command]
pub fn get_chapter_counts(db: State<Database>) -> Result<std::collections::HashMap<String, i32>, String> {
    let pairs = queries::get_chapter_counts(&db).map_err(|e| e.to_string())?;
    Ok(pairs.into_iter().collect())
}

#[tauri::command]
pub fn compare_verses(
    db: State<Database>,
    book: String,
    chapter: u32,
    verse: u32,
    translations: Vec<String>,
) -> Result<crate::database::CompareResult, String> {
    let trans_refs: Vec<&str> = translations.iter().map(|s| s.as_str()).collect();
    queries::compare_verses(&db, &book, chapter as i32, verse as i32, trans_refs)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_chapter_originals(
    db: State<Database>,
    book: String,
    chapter: u32,
) -> Result<Vec<Verse>, String> {
    queries::get_chapter_originals(&db, &book, chapter as i32).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_ketiv_qere(
    db: State<Database>,
    book: String,
    chapter: u32,
    verse: u32,
) -> Result<Vec<KetivQere>, String> {
    queries::get_ketiv_qere(&db, &book, chapter as i32, verse as i32).map_err(|e| e.to_string())
}
