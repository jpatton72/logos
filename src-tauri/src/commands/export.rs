use serde::{Deserialize, Serialize};
use tauri::State;

use crate::database::{queries, Database};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportedNote {
    pub id: i64,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub verse_ref: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportedBookmark {
    pub id: i64,
    pub label: Option<String>,
    pub verse_ref: String,
    pub verse_text: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub notes: Vec<ExportedNote>,
    pub bookmarks: Vec<ExportedBookmark>,
    pub exported_at: String,
}

fn parse_tags(tags_str: &Option<String>) -> Vec<String> {
    match tags_str {
        Some(s) if !s.is_empty() => serde_json::from_str(s).unwrap_or_else(|_| vec![]),
        _ => vec![],
    }
}

#[tauri::command]
pub fn export_notes_and_bookmarks(db: State<'_, Database>) -> Result<ExportData, String> {
    // Get all notes with verse references
    let notes_result: Result<Vec<queries::Note>, String> = queries::get_notes(&db, None)
        .map_err(|e| e.to_string());
    
    let notes = match notes_result {
        Ok(raw_notes) => {
            raw_notes.into_iter().map(|n| {
                let verse_ref = if let Some(vid) = n.verse_id {
                    queries::get_verse_by_id(&db, vid)
                        .ok()
                        .flatten()
                        .map(|v| format!("{} {}:{}", v.book_abbreviation, v.chapter, v.verse_num))
                } else {
                    None
                };
                
                ExportedNote {
                    id: n.id,
                    title: n.title,
                    content: n.content,
                    tags: parse_tags(&n.tags),
                    verse_ref,
                    created_at: n.created_at,
                    updated_at: n.updated_at,
                }
            }).collect()
        }
        Err(e) => return Err(e),
    };
    
    // Get all bookmarks
    let bookmarks_result: Result<Vec<queries::BookmarkWithVerse>, String> = queries::get_all_bookmarks(&db)
        .map_err(|e| e.to_string());
    
    let bookmarks = match bookmarks_result {
        Ok(raw_bookmarks) => {
            raw_bookmarks.into_iter().map(|b| {
                ExportedBookmark {
                    id: b.id,
                    label: b.label,
                    verse_ref: format!("{} {}:{}", b.book_abbreviation, b.chapter, b.verse_num),
                    verse_text: b.text,
                    created_at: b.created_at,
                }
            }).collect()
        }
        Err(e) => return Err(e),
    };
    
    Ok(ExportData {
        notes,
        bookmarks,
        exported_at: chrono_lite_now(),
    })
}

fn chrono_lite_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // Simple ISO 8601 format approximation
    let days = secs / 86400;
    let remaining = secs % 86400;
    let hours = remaining / 3600;
    let minutes = (remaining % 3600) / 60;
    let seconds = remaining % 60;
    // Approximate date calculation from epoch
    let year = 1970 + (days / 365) as u64;
    let day_of_year = days % 365;
    let month = (day_of_year / 30).saturating_add(1).min(12);
    let day = (day_of_year % 30).saturating_add(1);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hours, minutes, seconds)
}
