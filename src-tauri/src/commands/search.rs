use tauri::State;
use crate::database::{Database, SearchResult, TermResult, queries};

#[derive(Clone, serde::Deserialize)]
pub struct VerseFilters {
    pub translation: Option<String>,
    pub testament: Option<String>,
    pub genre: Option<String>,
}

#[derive(Clone, serde::Deserialize)]
pub struct SearchOptions {
    pub sort: Option<String>, // "relevance" | "book_order"
}

#[tauri::command]
pub fn search_verses(
    db: State<Database>,
    query: String,
    filters: Option<VerseFilters>,
    options: Option<SearchOptions>,
    limit: u32,
) -> Result<Vec<SearchResult>, String> {
    let filters = filters.unwrap_or(VerseFilters {
        translation: None,
        testament: None,
        genre: None,
    });
    let options = options.unwrap_or(SearchOptions {
        sort: Some("relevance".to_string()),
    });
    queries::search_verses(
        &db,
        &query,
        filters.translation.as_deref(),
        filters.testament.as_deref(),
        filters.genre.as_deref(),
        options.sort.as_deref(),
        limit,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_terms(
    db: State<Database>,
    query: String,
    min_frequency: u32,
) -> Result<Vec<TermResult>, String> {
    queries::search_terms(&db, &query, min_frequency)
        .map_err(|e| e.to_string())
}
