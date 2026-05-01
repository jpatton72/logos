use serde::Serialize;
use tauri::State;

use crate::database::{queries, Bookmark, BookmarkWithVerse, Database};

#[derive(Serialize)]
pub struct PaginatedBookmarks {
    pub items: Vec<BookmarkWithVerse>,
    pub total: i64,
}

#[tauri::command]
pub fn create_bookmark(
    db: State<'_, Database>,
    verse_id: i64,
    label: Option<String>,
) -> Result<Bookmark, String> {
    queries::create_bookmark(&db, verse_id, label.as_deref()).map_err(|e| e.to_string())
}

/// Returns a page of bookmarks plus the total row count, so the
/// frontend can show "(N of M)" and decide whether to render a
/// "Load more" button.
///
/// `limit` defaults to 100 if omitted; pass 0 explicitly to fetch
/// every row (used by the export command).
#[tauri::command]
pub fn get_bookmarks(
    db: State<'_, Database>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<PaginatedBookmarks, String> {
    let effective_limit = limit.or(Some(100));
    let items = queries::get_all_bookmarks(&db, effective_limit, offset)
        .map_err(|e| e.to_string())?;
    let total = queries::count_bookmarks(&db).map_err(|e| e.to_string())?;
    Ok(PaginatedBookmarks { items, total })
}

#[tauri::command]
pub fn delete_bookmark(db: State<'_, Database>, id: i64) -> Result<(), String> {
    queries::delete_bookmark(&db, id).map_err(|e| e.to_string())
}
