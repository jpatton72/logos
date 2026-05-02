use rusqlite::{params, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use tracing::info;

use crate::database::Database;

// ============================================================================
// Data Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: i64,
    pub abbreviation: String,
    pub full_name: String,
    pub testament: String,
    pub genre: String,
    pub order_index: i32,
}

#[allow(dead_code)] // Schema mirror; kept for potential future commands.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Translation {
    pub id: i64,
    pub name: String,
    pub abbreviation: String,
    pub language: String,
    pub source_url: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Verse {
    pub id: i64,
    pub book_id: i64,
    pub book_abbreviation: String,
    pub chapter: i32,
    pub verse_num: i32,
    pub translation_id: i64,
    pub text: String,
    #[serde(default)]
    pub translation_abbreviation: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub word_mappings: Option<Vec<WordMapping>>,
}

impl Default for Verse {
    fn default() -> Self {
        Self {
            id: 0,
            book_id: 0,
            book_abbreviation: String::new(),
            chapter: 0,
            verse_num: 0,
            translation_id: 0,
            text: String::new(),
            translation_abbreviation: None,
            word_mappings: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VerseGroup {
    pub chapter: i32,
    pub verse_num: i32,
    pub verses: Vec<Verse>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Bookmark {
    pub id: i64,
    pub verse_id: i64,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookmarkVerseSummary {
    pub id: i64,
    pub book_id: i64,
    pub book_abbreviation: String,
    pub chapter: i32,
    pub verse_num: i32,
    pub translation_id: i64,
    pub translation_abbreviation: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BookmarkWithVerse {
    pub id: i64,
    pub verse_id: i64,
    pub label: Option<String>,
    pub created_at: String,
    pub verse: BookmarkVerseSummary,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: i64,
    pub verse_id: Option<i64>,
    pub title: Option<String>,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn parse_tags(raw: Option<String>) -> Vec<String> {
    raw.and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StrongsGreek {
    pub id: String,
    pub word: String,
    pub transliteration: String,
    pub definition: String,
    pub pronunciation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StrongsHebrew {
    pub id: String,
    pub word: String,
    pub ketiv_qere: Option<String>,
    pub transliteration: String,
    pub definition: String,
    pub pronunciation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordMapping {
    pub id: i64,
    pub verse_id: i64,
    pub word_index: i32,
    pub strongs_id: String,
    pub original_word: String,
    pub lemma: Option<String>,
    pub morphology: Option<String>,
    pub language: String,
}

/// One saved AI conversation. Messages, verse_context, and word_context
/// are stored as JSON strings on the Rust side and forwarded as-is to
/// the frontend; the renderer parses them back into typed objects. We
/// don't try to model `ChatMessage` etc. here because the schema lives
/// in `lib/ai.ts` on the JS side and round-tripping through Rust types
/// adds zero value.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConversation {
    pub id: i64,
    pub title: Option<String>,
    pub messages: String,         // JSON-encoded ChatMessage[]
    pub verse_context: Option<String>,  // JSON-encoded VerseRef[] or null
    pub word_context: Option<String>,   // JSON-encoded WordContext or null
    pub provider: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Compact conversation summary for list views — the full `messages`
/// blob can be tens of KB on a long chat, so the list query returns
/// just a snippet (first ~120 chars of the first user message).
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AiConversationSummary {
    pub id: i64,
    pub title: Option<String>,
    pub preview: String,
    pub message_count: i32,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// One row of the English-to-Strong's lookup. Returned ranked by
/// `frequency` (descending) so the top hit is the most likely match for
/// the queried English word.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnglishStrongsResult {
    pub strongs_id: String,
    pub language: String,
    pub frequency: i64,
    pub original_word: Option<String>,
    pub transliteration: Option<String>,
    pub definition: Option<String>,
    pub sample_book_abbreviation: Option<String>,
    pub sample_book_name: Option<String>,
    pub sample_chapter: Option<i32>,
    pub sample_verse: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReadingProgressEntry {
    pub book_id: i64,
    pub chapter: i32,
    pub last_read_at: String,
}

/// A Ketiv/Qere annotation for a verse. The Masoretic text writes "ketiv" (written)
/// but the tradition reads "qere" (read). Multiple K/Q pairs may exist in one verse.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KetivQere {
    pub ketiv: String,
    pub qere: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TermResult {
    pub term: String,
    pub verse_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub verse_id: i64,
    pub book_abbreviation: String,
    pub book_name: String,
    pub chapter: i32,
    pub verse_num: i32,
    pub text: String,
    pub translation_abbreviation: String,
    pub rank: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CompareResult {
    pub book_abbreviation: String,
    pub chapter: i32,
    pub verse_num: i32,
    pub translations: Vec<Verse>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct IngestResult {
    pub terms_indexed: i64,
    pub unique_terms: i64,
    pub already_populated: bool,
}

// ============================================================================
// Book Queries
// ============================================================================

pub fn get_all_books(db: &Database) -> SqliteResult<Vec<Book>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, abbreviation, full_name, testament, genre, order_index 
         FROM books ORDER BY order_index"
    )?;

    let books = stmt.query_map([], |row| {
        Ok(Book {
            id: row.get(0)?,
            abbreviation: row.get(1)?,
            full_name: row.get(2)?,
            testament: row.get(3)?,
            genre: row.get(4)?,
            order_index: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(books)
}

/// Returns (lowercase abbreviation, max chapter) pairs for every book that
/// has at least one verse loaded. The frontend uses this to size chapter
/// dropdowns and decide when chapter-arrow navigation should roll over to
/// the next book — replacing a hand-maintained map that drifted from the
/// DB whenever a translation was added or removed.
pub fn get_chapter_counts(db: &Database) -> SqliteResult<Vec<(String, i32)>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT LOWER(b.abbreviation), MAX(v.chapter)
         FROM verses v
         JOIN books b ON v.book_id = b.id
         GROUP BY b.id
         ORDER BY b.order_index"
    )?;
    let rows = stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[allow(dead_code)] // Helper kept for future commands; not currently invoked from Tauri.
pub fn get_book_by_abbreviation(db: &Database, abbreviation: &str) -> SqliteResult<Option<Book>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, abbreviation, full_name, testament, genre, order_index
         FROM books WHERE abbreviation = ? COLLATE NOCASE"
    )?;

    let mut rows = stmt.query(params![abbreviation])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Book {
            id: row.get(0)?,
            abbreviation: row.get(1)?,
            full_name: row.get(2)?,
            testament: row.get(3)?,
            genre: row.get(4)?,
            order_index: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

// ============================================================================
// Translation Queries
// ============================================================================

#[allow(dead_code)] // Helper kept for future commands; not currently invoked from Tauri.
pub fn get_all_translations(db: &Database) -> SqliteResult<Vec<Translation>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, abbreviation, language, source_url, notes FROM translations"
    )?;

    let translations = stmt.query_map([], |row| {
        Ok(Translation {
            id: row.get(0)?,
            name: row.get(1)?,
            abbreviation: row.get(2)?,
            language: row.get(3)?,
            source_url: row.get(4)?,
            notes: row.get(5)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(translations)
}

#[allow(dead_code)] // Helper kept for future commands; not currently invoked from Tauri.
pub fn get_translation_by_abbreviation(db: &Database, abbreviation: &str) -> SqliteResult<Option<Translation>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, abbreviation, language, source_url, notes
         FROM translations WHERE abbreviation = ? COLLATE NOCASE"
    )?;

    let mut rows = stmt.query(params![abbreviation])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Translation {
            id: row.get(0)?,
            name: row.get(1)?,
            abbreviation: row.get(2)?,
            language: row.get(3)?,
            source_url: row.get(4)?,
            notes: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

// ============================================================================
// Verse Queries
// ============================================================================

pub fn get_verse(db: &Database, book_abbreviation: &str, chapter: i32, verse_num: i32, translation_abbreviation: &str) -> SqliteResult<Option<Verse>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT v.id, v.book_id, b.abbreviation, v.chapter, v.verse_num, v.translation_id, v.text
         FROM verses v
         JOIN books b ON v.book_id = b.id
         JOIN translations t ON v.translation_id = t.id
         WHERE b.abbreviation = ? COLLATE NOCASE
           AND v.chapter = ? AND v.verse_num = ?
           AND t.abbreviation = ? COLLATE NOCASE"
    )?;

    let mut rows = stmt.query(params![book_abbreviation, chapter, verse_num, translation_abbreviation])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Verse {
            id: row.get(0)?,
            book_id: row.get(1)?,
            book_abbreviation: row.get(2)?,
            chapter: row.get(3)?,
            verse_num: row.get(4)?,
            translation_id: row.get(5)?,
            text: row.get(6)?,
            ..Verse::default()
        }))
    } else {
        Ok(None)
    }
}

pub fn get_chapter(db: &Database, book_abbreviation: &str, chapter: i32, translations: Vec<&str>) -> SqliteResult<Vec<VerseGroup>> {
    let conn = db.conn.lock().unwrap();
    
    if translations.is_empty() {
        return Ok(vec![]);
    }

    let placeholders: Vec<&str> = translations.iter().map(|_| "?").collect();
    let query = format!(
        "SELECT v.id, v.book_id, b.abbreviation, v.chapter, v.verse_num, v.translation_id, v.text, t.abbreviation as trans_abbr
         FROM verses v
         JOIN books b ON v.book_id = b.id
         JOIN translations t ON v.translation_id = t.id
         WHERE b.abbreviation = ? COLLATE NOCASE
           AND v.chapter = ?
           AND t.abbreviation COLLATE NOCASE IN ({})
         ORDER BY v.verse_num, t.id",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&query)?;
    
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&book_abbreviation, &chapter];
    for trans in &translations {
        params_vec.push(trans);
    }
    
    let rows = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
        let trans_abbr: String = row.get(7)?;
        Ok((
            row.get::<_, i32>(3)?,  // chapter
            row.get::<_, i32>(4)?,  // verse_num
            Verse {
                id: row.get(0)?,
                book_id: row.get(1)?,
                book_abbreviation: row.get(2)?,
                chapter: row.get(3)?,
                verse_num: row.get(4)?,
                translation_id: row.get(5)?,
                text: row.get(6)?,
                translation_abbreviation: Some(trans_abbr),
                ..Verse::default()
            },
        ))
    })?.collect::<Result<Vec<_>, _>>()?;

    // Group by verse_num
    let mut verse_groups: Vec<VerseGroup> = Vec::new();
    let mut current_verse_num: Option<i32> = None;
    let mut current_group: Vec<Verse> = Vec::new();

    for (ch, vn, verse) in rows {
        if current_verse_num != Some(vn) {
            if !current_group.is_empty() {
                verse_groups.push(VerseGroup {
                    chapter: ch,
                    verse_num: current_verse_num.unwrap(),
                    verses: current_group,
                });
            }
            current_verse_num = Some(vn);
            current_group = vec![verse];
        } else {
            current_group.push(verse);
        }
    }

    if !current_group.is_empty() {
        verse_groups.push(VerseGroup {
            chapter: chapter,
            verse_num: current_verse_num.unwrap(),
            verses: current_group,
        });
    }

    Ok(verse_groups)
}

pub fn get_verse_by_id(db: &Database, verse_id: i64) -> SqliteResult<Option<Verse>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT v.id, v.book_id, b.abbreviation, v.chapter, v.verse_num, v.translation_id, v.text
         FROM verses v
         JOIN books b ON v.book_id = b.id
         WHERE v.id = ?"
    )?;

    let mut rows = stmt.query(params![verse_id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(Verse {
            id: row.get(0)?,
            book_id: row.get(1)?,
            book_abbreviation: row.get(2)?,
            chapter: row.get(3)?,
            verse_num: row.get(4)?,
            translation_id: row.get(5)?,
            text: row.get(6)?,
            ..Verse::default()
        }))
    } else {
        Ok(None)
    }
}

// ============================================================================
// Search Queries
// ============================================================================

pub fn search_verses(
    db: &Database,
    query: &str,
    translation: Option<&str>,
    testament: Option<&str>,
    genre: Option<&str>,
    sort: Option<&str>,
    limit: Option<u32>,
) -> SqliteResult<Vec<SearchResult>> {
    let conn = db.conn.lock().unwrap();

    let order_by = match sort {
        Some("book_order") => "b.order_index ASC, v.chapter ASC, v.verse_num ASC",
        _ => "verses_fts.rank ASC",
    };

    let limit_clause = if limit.is_some() { "LIMIT ?" } else { "" };
    let sql = format!(
        "SELECT v.id, b.abbreviation, b.full_name, v.chapter, v.verse_num, v.text, t.abbreviation, verses_fts.rank
         FROM verses_fts
         JOIN verses v ON verses_fts.verse_id = v.id
         JOIN books b ON v.book_id = b.id
         JOIN translations t ON v.translation_id = t.id
         WHERE verses_fts MATCH ?
           AND (? IS NULL OR t.abbreviation = ? COLLATE NOCASE)
           AND (? IS NULL OR b.testament = ? COLLATE NOCASE)
           AND (? IS NULL OR b.genre = ? COLLATE NOCASE)
         ORDER BY {} {}",
        order_by, limit_clause,
    );

    let mut stmt = conn.prepare(&sql)?;

    let mut bound: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(query.to_string()),
        Box::new(translation.map(String::from)),
        Box::new(translation.map(String::from)),
        Box::new(testament.map(String::from)),
        Box::new(testament.map(String::from)),
        Box::new(genre.map(String::from)),
        Box::new(genre.map(String::from)),
    ];
    if let Some(n) = limit {
        bound.push(Box::new(n));
    }

    let bound_refs: Vec<&dyn rusqlite::ToSql> = bound.iter().map(|b| b.as_ref()).collect();
    let results = stmt
        .query_map(rusqlite::params_from_iter(bound_refs), |row| {
            Ok(SearchResult {
                verse_id: row.get(0)?,
                book_abbreviation: row.get(1)?,
                book_name: row.get(2)?,
                chapter: row.get(3)?,
                verse_num: row.get(4)?,
                text: row.get(5)?,
                translation_abbreviation: row.get(6)?,
                rank: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}

pub fn search_terms(db: &Database, query: &str, min_frequency: u32) -> SqliteResult<Vec<TermResult>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT term, verse_count FROM terms_fts WHERE term MATCH ? AND verse_count >= ?"
    )?;

    let results = stmt.query_map(params![query, min_frequency], |row| {
        Ok(TermResult {
            term: row.get(0)?,
            verse_count: row.get(1)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(results)
}

// ============================================================================
// Bookmark Queries
// ============================================================================

pub fn create_bookmark(db: &Database, verse_id: i64, label: Option<&str>) -> SqliteResult<Bookmark> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO bookmarks (verse_id, label) VALUES (?, ?)",
        params![verse_id, label],
    )?;

    let id = conn.last_insert_rowid();
    let mut stmt = conn.prepare("SELECT id, verse_id, label, created_at FROM bookmarks WHERE id = ?")?;
    let bookmark = stmt.query_row(params![id], |row| {
        Ok(Bookmark {
            id: row.get(0)?,
            verse_id: row.get(1)?,
            label: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    Ok(bookmark)
}

pub fn get_all_bookmarks(
    db: &Database,
    limit: Option<u32>,
    offset: Option<u32>,
) -> SqliteResult<Vec<BookmarkWithVerse>> {
    let conn = db.conn.lock().unwrap();
    // None / 0 means "no limit" so existing callers (the export command,
    // anything that needs the full set) keep working.
    let lim: i64 = limit.filter(|n| *n > 0).map(|n| n as i64).unwrap_or(-1);
    let off: i64 = offset.unwrap_or(0) as i64;
    let mut stmt = conn.prepare(
        "SELECT b.id, b.verse_id, b.label, b.created_at,
                v.id, v.book_id, bn.abbreviation, v.chapter, v.verse_num,
                v.translation_id, t.abbreviation, v.text
         FROM bookmarks b
         JOIN verses v ON b.verse_id = v.id
         JOIN books bn ON v.book_id = bn.id
         JOIN translations t ON v.translation_id = t.id
         ORDER BY b.created_at DESC
         LIMIT ? OFFSET ?",
    )?;

    let bookmarks = stmt
        .query_map(params![lim, off], |row| {
            Ok(BookmarkWithVerse {
                id: row.get(0)?,
                verse_id: row.get(1)?,
                label: row.get(2)?,
                created_at: row.get(3)?,
                verse: BookmarkVerseSummary {
                    id: row.get(4)?,
                    book_id: row.get(5)?,
                    book_abbreviation: row.get(6)?,
                    chapter: row.get(7)?,
                    verse_num: row.get(8)?,
                    translation_id: row.get(9)?,
                    translation_abbreviation: row.get(10)?,
                    text: row.get(11)?,
                },
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(bookmarks)
}

pub fn count_bookmarks(db: &Database) -> SqliteResult<i64> {
    let conn = db.conn.lock().unwrap();
    conn.query_row("SELECT COUNT(*) FROM bookmarks", [], |r| r.get(0))
}

pub fn delete_bookmark(db: &Database, id: i64) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM bookmarks WHERE id = ?", params![id])?;
    Ok(())
}

// ============================================================================
// Note Queries
// ============================================================================

pub fn create_note(db: &Database, verse_id: Option<i64>, title: Option<&str>, content: &str, tags: Vec<&str>) -> SqliteResult<Note> {
    let conn = db.conn.lock().unwrap();
    let tags_json = serde_json::to_string(&tags).unwrap_or_default();
    
    conn.execute(
        "INSERT INTO notes (verse_id, title, content, tags) VALUES (?, ?, ?, ?)",
        params![verse_id, title, content, tags_json],
    )?;

    let id = conn.last_insert_rowid();
    let mut stmt = conn.prepare("SELECT id, verse_id, title, content, tags, created_at, updated_at FROM notes WHERE id = ?")?;
    let note = stmt.query_row(params![id], |row| {
        Ok(Note {
            id: row.get(0)?,
            verse_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            tags: parse_tags(row.get(4)?),
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;

    Ok(note)
}

pub fn get_notes(
    db: &Database,
    verse_id: Option<i64>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> SqliteResult<Vec<Note>> {
    let conn = db.conn.lock().unwrap();

    let lim: i64 = limit.filter(|n| *n > 0).map(|n| n as i64).unwrap_or(-1);
    let off: i64 = offset.unwrap_or(0) as i64;

    let (sql, params_vec): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(vid) = verse_id {
        (
            "SELECT id, verse_id, title, content, tags, created_at, updated_at
             FROM notes WHERE verse_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?"
                .to_string(),
            vec![Box::new(vid), Box::new(lim), Box::new(off)],
        )
    } else {
        (
            "SELECT id, verse_id, title, content, tags, created_at, updated_at
             FROM notes ORDER BY updated_at DESC LIMIT ? OFFSET ?"
                .to_string(),
            vec![Box::new(lim), Box::new(off)],
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

    let notes = stmt.query_map(rusqlite::params_from_iter(params_refs), |row| {
        Ok(Note {
            id: row.get(0)?,
            verse_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            tags: parse_tags(row.get(4)?),
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

pub fn count_notes(db: &Database, verse_id: Option<i64>) -> SqliteResult<i64> {
    let conn = db.conn.lock().unwrap();
    if let Some(vid) = verse_id {
        conn.query_row(
            "SELECT COUNT(*) FROM notes WHERE verse_id = ?",
            params![vid],
            |r| r.get(0),
        )
    } else {
        conn.query_row("SELECT COUNT(*) FROM notes", [], |r| r.get(0))
    }
}

pub fn update_note(db: &Database, id: i64, title: Option<&str>, content: &str, tags: Vec<&str>) -> SqliteResult<Note> {
    let conn = db.conn.lock().unwrap();
    let tags_json = serde_json::to_string(&tags).unwrap_or_default();
    
    conn.execute(
        "UPDATE notes SET title = ?, content = ?, tags = ?, updated_at = datetime('now') WHERE id = ?",
        params![title, content, tags_json, id],
    )?;

    let mut stmt = conn.prepare("SELECT id, verse_id, title, content, tags, created_at, updated_at FROM notes WHERE id = ?")?;
    let note = stmt.query_row(params![id], |row| {
        Ok(Note {
            id: row.get(0)?,
            verse_id: row.get(1)?,
            title: row.get(2)?,
            content: row.get(3)?,
            tags: parse_tags(row.get(4)?),
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    })?;

    Ok(note)
}

pub fn delete_note(db: &Database, id: i64) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM notes WHERE id = ?", params![id])?;
    Ok(())
}

pub fn search_notes(db: &Database, query: &str) -> SqliteResult<Vec<Note>> {
    let conn = db.conn.lock().unwrap();

    // Sanitize FTS5 input: strip operator characters and wrap each
    // surviving word in double quotes so the user's text is treated as
    // literal phrases (the Reader's search bar already does the same).
    let cleaned: String = query
        .chars()
        .map(|c| if c.is_alphanumeric() || c.is_whitespace() { c } else { ' ' })
        .collect();
    let tokens: Vec<String> = cleaned
        .split_whitespace()
        .map(|t| format!("\"{}\"", t))
        .collect();
    if tokens.is_empty() {
        return Ok(Vec::new());
    }
    let match_query = tokens.join(" ");

    // FTS5 MATCH against the notes_fts mirror, then JOIN back to notes
    // for the full row data. notes_fts.rank gives us relevance ordering;
    // ties fall back to most-recently-updated.
    let mut stmt = conn.prepare(
        "SELECT n.id, n.verse_id, n.title, n.content, n.tags, n.created_at, n.updated_at
         FROM notes_fts f
         JOIN notes n ON n.id = f.note_id
         WHERE notes_fts MATCH ?
         ORDER BY f.rank ASC, n.updated_at DESC",
    )?;

    let notes = stmt
        .query_map(params![match_query], |row| {
            Ok(Note {
                id: row.get(0)?,
                verse_id: row.get(1)?,
                title: row.get(2)?,
                content: row.get(3)?,
                tags: parse_tags(row.get(4)?),
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(notes)
}

// ============================================================================
// Lexicon Queries
// ============================================================================

pub fn get_strongs_greek(db: &Database, id: &str) -> SqliteResult<Option<StrongsGreek>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, word, transliteration, definition, pronunciation FROM strongs_greek WHERE id = ?"
    )?;

    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(StrongsGreek {
            id: row.get(0)?,
            word: row.get(1)?,
            transliteration: row.get(2)?,
            definition: row.get(3)?,
            pronunciation: row.get(4)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_ketiv_qere(db: &Database, book_abbreviation: &str, chapter: i32, verse_num: i32) -> SqliteResult<Vec<KetivQere>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT k.ketiv, k.qere
         FROM ketiv_qere k
         JOIN books b ON k.book_id = b.id
         WHERE b.abbreviation = ? COLLATE NOCASE AND k.chapter = ? AND k.verse_num = ?",
    )?;
    let entries = stmt
        .query_map(params![book_abbreviation, chapter, verse_num], |row| {
            Ok(KetivQere {
                ketiv: row.get(0)?,
                qere: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

pub fn get_strongs_hebrew(db: &Database, id: &str) -> SqliteResult<Option<StrongsHebrew>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, word, ketiv_qere, transliteration, definition, pronunciation FROM strongs_hebrew WHERE id = ?"
    )?;

    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(StrongsHebrew {
            id: row.get(0)?,
            word: row.get(1)?,
            ketiv_qere: row.get(2)?,
            transliteration: row.get(3)?,
            definition: row.get(4)?,
            pronunciation: row.get(5)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn get_verse_words(db: &Database, verse_id: i64) -> SqliteResult<Vec<WordMapping>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, verse_id, word_index, strongs_id, original_word, lemma, morphology, language
         FROM word_mappings WHERE verse_id = ? ORDER BY word_index"
    )?;

    let words = stmt.query_map(params![verse_id], |row| {
        Ok(WordMapping {
            id: row.get(0)?,
            verse_id: row.get(1)?,
            word_index: row.get(2)?,
            strongs_id: row.get(3)?,
            original_word: row.get(4)?,
            lemma: row.get(5)?,
            morphology: row.get(6)?,
            language: row.get(7)?,
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(words)
}

// ============================================================================
// English -> Strong's Lookup
// ============================================================================

/// Look up an English word in `english_strongs_index` and return ranked
/// Strong's candidates with their lexicon entries and one example
/// reference. Built from the eBible.org KJV2006 USFM ingest, so the
/// English word matching is exact-match against KJV wording — searching
/// "love" returns G26/G25/H157/etc.; searching "charity" returns G26
/// alone (KJV uses "charity" in 1 Cor 13).
pub fn lookup_english_term(
    db: &Database,
    term: &str,
    limit: u32,
) -> SqliteResult<Vec<EnglishStrongsResult>> {
    let conn = db.conn.lock().unwrap();
    let normalized = term.trim().to_lowercase();
    if normalized.is_empty() {
        return Ok(Vec::new());
    }
    // LEFT JOIN both lexicon tables; the language column on the index
    // tells us which one will have a match. COALESCE picks the right
    // one without needing two queries.
    let mut stmt = conn.prepare(
        "SELECT
            i.strongs_id,
            i.language,
            i.frequency,
            COALESCE(sg.word, sh.word) AS original_word,
            COALESCE(sg.transliteration, sh.transliteration) AS transliteration,
            COALESCE(sg.definition, sh.definition) AS definition,
            b.abbreviation AS sample_book_abbrev,
            b.full_name AS sample_book_name,
            i.sample_chapter,
            i.sample_verse
         FROM english_strongs_index i
         LEFT JOIN strongs_greek sg ON i.language = 'greek' AND sg.id = i.strongs_id
         LEFT JOIN strongs_hebrew sh ON i.language = 'hebrew' AND sh.id = i.strongs_id
         LEFT JOIN books b ON b.id = i.sample_book_id
         WHERE i.english_word = ?
         ORDER BY i.frequency DESC
         LIMIT ?",
    )?;
    let rows = stmt
        .query_map(params![normalized, limit as i64], |row| {
            Ok(EnglishStrongsResult {
                strongs_id: row.get(0)?,
                language: row.get(1)?,
                frequency: row.get(2)?,
                original_word: row.get(3)?,
                transliteration: row.get(4)?,
                definition: row.get(5)?,
                sample_book_abbreviation: row.get(6)?,
                sample_book_name: row.get(7)?,
                sample_chapter: row.get(8)?,
                sample_verse: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

// ============================================================================
// AI Conversations
// ============================================================================

/// Upserts a conversation. Pass `id = None` for a new chat (returns the
/// freshly-allocated rowid); pass `id = Some(...)` to overwrite an
/// existing row's body. Updates `updated_at` on every call so the list
/// view's "most recent" sort stays accurate.
pub fn save_ai_conversation(
    db: &Database,
    id: Option<i64>,
    title: Option<&str>,
    messages_json: &str,
    verse_context_json: Option<&str>,
    word_context_json: Option<&str>,
    provider: Option<&str>,
    model: Option<&str>,
) -> SqliteResult<i64> {
    let conn = db.conn.lock().unwrap();
    if let Some(existing_id) = id {
        conn.execute(
            "UPDATE ai_conversations
             SET title = ?, messages = ?, verse_context = ?, word_context = ?,
                 provider = ?, model = ?, updated_at = datetime('now')
             WHERE id = ?",
            params![title, messages_json, verse_context_json, word_context_json, provider, model, existing_id],
        )?;
        Ok(existing_id)
    } else {
        conn.execute(
            "INSERT INTO ai_conversations (title, messages, verse_context, word_context, provider, model)
             VALUES (?, ?, ?, ?, ?, ?)",
            params![title, messages_json, verse_context_json, word_context_json, provider, model],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

pub fn list_ai_conversations(
    db: &Database,
    limit: Option<u32>,
    offset: Option<u32>,
) -> SqliteResult<Vec<AiConversationSummary>> {
    let conn = db.conn.lock().unwrap();
    let lim: i64 = limit.filter(|n| *n > 0).map(|n| n as i64).unwrap_or(-1);
    let off: i64 = offset.unwrap_or(0) as i64;
    let mut stmt = conn.prepare(
        "SELECT id, title, messages, provider, model, created_at, updated_at
         FROM ai_conversations
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?",
    )?;
    let rows = stmt
        .query_map(params![lim, off], |row| {
            let id: i64 = row.get(0)?;
            let title: Option<String> = row.get(1)?;
            let messages_json: String = row.get(2)?;
            let provider: Option<String> = row.get(3)?;
            let model: Option<String> = row.get(4)?;
            let created_at: String = row.get(5)?;
            let updated_at: String = row.get(6)?;
            // Pull the first user message's content as the preview.
            // Best-effort: malformed JSON yields an empty preview rather
            // than a query error.
            let parsed: Option<serde_json::Value> = serde_json::from_str(&messages_json).ok();
            let mut preview = String::new();
            let mut count: i32 = 0;
            if let Some(serde_json::Value::Array(arr)) = parsed {
                count = arr.len() as i32;
                for m in &arr {
                    if m.get("role").and_then(|r| r.as_str()) == Some("user") {
                        if let Some(c) = m.get("content").and_then(|c| c.as_str()) {
                            preview = c.chars().take(120).collect();
                            break;
                        }
                    }
                }
            }
            Ok(AiConversationSummary {
                id,
                title,
                preview,
                message_count: count,
                provider,
                model,
                created_at,
                updated_at,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn count_ai_conversations(db: &Database) -> SqliteResult<i64> {
    let conn = db.conn.lock().unwrap();
    conn.query_row("SELECT COUNT(*) FROM ai_conversations", [], |r| r.get(0))
}

pub fn get_ai_conversation(db: &Database, id: i64) -> SqliteResult<Option<AiConversation>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, title, messages, verse_context, word_context, provider, model, created_at, updated_at
         FROM ai_conversations WHERE id = ?",
    )?;
    let mut rows = stmt.query(params![id])?;
    if let Some(row) = rows.next()? {
        Ok(Some(AiConversation {
            id: row.get(0)?,
            title: row.get(1)?,
            messages: row.get(2)?,
            verse_context: row.get(3)?,
            word_context: row.get(4)?,
            provider: row.get(5)?,
            model: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        }))
    } else {
        Ok(None)
    }
}

pub fn delete_ai_conversation(db: &Database, id: i64) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM ai_conversations WHERE id = ?", params![id])?;
    Ok(())
}

pub fn update_ai_conversation_title(db: &Database, id: i64, title: Option<&str>) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE ai_conversations SET title = ?, updated_at = datetime('now') WHERE id = ?",
        params![title, id],
    )?;
    Ok(())
}

// ============================================================================
// Progress Queries
// ============================================================================

pub fn get_reading_progress(db: &Database) -> SqliteResult<Vec<ReadingProgressEntry>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT book_id, chapter, last_read_at FROM reading_progress ORDER BY last_read_at DESC"
    )?;
    let entries = stmt
        .query_map([], |row| {
            Ok(ReadingProgressEntry {
                book_id: row.get(0)?,
                chapter: row.get(1)?,
                last_read_at: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

pub fn update_reading_progress(db: &Database, book_id: i64, chapter: i32) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO reading_progress (book_id, chapter, last_read_at) VALUES (?, ?, datetime('now'))",
        params![book_id, chapter],
    )?;
    Ok(())
}

// ============================================================================
// Preference Queries
// ============================================================================

pub fn get_preference(db: &Database, key: &str) -> SqliteResult<Option<String>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT value FROM user_preferences WHERE key = ?")?;
    
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

pub fn set_preference(db: &Database, key: &str, value: &str) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO user_preferences (key, value) VALUES (?, ?)",
        params![key, value],
    )?;
    Ok(())
}

/// Returns every preference whose key starts with `prefix`. Used by the
/// startup keyring migration to drain `api_key_*` rows out of the
/// preferences table after copying them into the OS credential vault.
pub fn list_preferences_with_prefix(db: &Database, prefix: &str) -> SqliteResult<Vec<(String, String)>> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn.prepare("SELECT key, value FROM user_preferences WHERE key LIKE ?1")?;
    let pattern = format!("{}%", prefix);
    let rows = stmt
        .query_map(params![pattern], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn delete_preference(db: &Database, key: &str) -> SqliteResult<()> {
    let conn = db.conn.lock().unwrap();
    conn.execute("DELETE FROM user_preferences WHERE key = ?", params![key])?;
    Ok(())
}

// ============================================================================
// Compare Verses
// ============================================================================

pub fn compare_verses(db: &Database, book_abbreviation: &str, chapter: i32, verse_num: i32, translations: Vec<&str>) -> SqliteResult<CompareResult> {
    if translations.is_empty() {
        return Ok(CompareResult {
            book_abbreviation: book_abbreviation.to_string(),
            chapter,
            verse_num,
            translations: vec![],
        });
    }

    let conn = db.conn.lock().unwrap();
    
    let placeholders: Vec<&str> = translations.iter().map(|_| "?").collect();
    let query = format!(
        "SELECT v.id, v.book_id, b.abbreviation, v.chapter, v.verse_num, v.translation_id, v.text
         FROM verses v
         JOIN books b ON v.book_id = b.id
         JOIN translations t ON v.translation_id = t.id
         WHERE b.abbreviation = ? COLLATE NOCASE
           AND v.chapter = ? AND v.verse_num = ?
           AND t.abbreviation COLLATE NOCASE IN ({})
         ORDER BY t.id",
        placeholders.join(", ")
    );

    let mut stmt = conn.prepare(&query)?;
    
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&book_abbreviation, &chapter, &verse_num];
    for trans in &translations {
        params_vec.push(trans);
    }
    
    let verses = stmt.query_map(rusqlite::params_from_iter(params_vec), |row| {
        Ok(Verse {
            id: row.get(0)?,
            book_id: row.get(1)?,
            book_abbreviation: row.get(2)?,
            chapter: row.get(3)?,
            verse_num: row.get(4)?,
            translation_id: row.get(5)?,
            text: row.get(6)?,
            ..Verse::default()
        })
    })?.collect::<Result<Vec<_>, _>>()?;

    Ok(CompareResult {
        book_abbreviation: book_abbreviation.to_string(),
        chapter,
        verse_num,
        translations: verses,
    })
}

// ============================================================================
// Original Language Queries
// ============================================================================

/// Fetches the OSHB (Hebrew) and SBLGNT (Greek) verses for a given chapter,
/// along with word-level mappings (Strong's numbers, morphology).
/// Uses a single LEFT JOIN — no N+1.
pub fn get_chapter_originals(
    db: &Database,
    book_abbreviation: &str,
    chapter: i32,
) -> SqliteResult<Vec<Verse>> {
    let conn = db.conn.lock().unwrap();

    // Single query: verses LEFT JOIN word_mappings, ordered so all word rows
    // for a verse appear consecutively.
    let mut stmt = conn.prepare(
        "SELECT
             v.id AS verse_id,
             v.book_id,
             b.abbreviation,
             v.chapter,
             v.verse_num,
             v.translation_id,
             v.text,
             t.abbreviation AS trans_abbr,
             wm.id AS wm_id,
             wm.word_index,
             wm.strongs_id,
             wm.original_word,
             wm.lemma,
             wm.morphology,
             wm.language AS wm_lang
         FROM verses v
         JOIN books b ON v.book_id = b.id
         JOIN translations t ON v.translation_id = t.id
         LEFT JOIN word_mappings wm ON wm.verse_id = v.id
         WHERE b.abbreviation = ? COLLATE NOCASE
           AND v.chapter = ?
           AND t.abbreviation COLLATE NOCASE IN ('oshb', 'sblgnt', 'wlc')
         ORDER BY v.verse_num, t.id, wm.word_index",
    )?;

    let rows = stmt.query_map(params![book_abbreviation, chapter], |row| {
        Ok((
            row.get::<_, i64>("verse_id")?,
            row.get::<_, i64>("book_id")?,
            row.get::<_, String>("abbreviation")?,
            row.get::<_, i32>("chapter")?,
            row.get::<_, i32>("verse_num")?,
            row.get::<_, i64>("translation_id")?,
            row.get::<_, String>("text")?,
            row.get::<_, String>("trans_abbr")?,
            row.get::<_, Option<i64>>("wm_id")?,
            row.get::<_, Option<i32>>("word_index")?,
            row.get::<_, Option<String>>("strongs_id")?,
            row.get::<_, Option<String>>("original_word")?,
            row.get::<_, Option<String>>("lemma")?,
            row.get::<_, Option<String>>("morphology")?,
            row.get::<_, Option<String>>("wm_lang")?,
        ))
    })?.collect::<Result<Vec<_>, _>>()?;

    // Group rows by verse_id in Rust
    use std::collections::HashMap;
    let mut verse_map: HashMap<i64, Verse> = HashMap::new();
    let mut word_map: HashMap<i64, Vec<WordMapping>> = HashMap::new();

    for row in rows {
        let (verse_id, book_id, book_abbrev, ch, vn, trans_id, text, trans_abbr,
             wm_id, word_index, strongs_id, original_word, lemma, morphology, wm_lang) = row;

        verse_map.entry(verse_id).or_insert_with(|| Verse {
            id: verse_id,
            book_id,
            book_abbreviation: book_abbrev,
            chapter: ch,
            verse_num: vn,
            translation_id: trans_id,
            text,
            translation_abbreviation: Some(trans_abbr),
            word_mappings: None,
        });

        if let (Some(id), Some(idx), Some(sid), Some(ow), Some(lang)) =
            (wm_id, word_index, strongs_id, original_word, wm_lang)
        {
            word_map.entry(verse_id).or_default().push(WordMapping {
                id,
                verse_id,
                word_index: idx,
                strongs_id: sid,
                original_word: ow,
                lemma,
                morphology,
                language: lang,
            });
        }
    }

    // Assemble verses with their word_mappings
    let mut verses: Vec<Verse> = verse_map
        .into_iter()
        .map(|(id, mut v)| {
            v.word_mappings = Some(word_map.remove(&id).unwrap_or_default());
            v
        })
        .collect();

    // Restore original sort order: by verse_num, then translation order
    verses.sort_by_key(|v| (v.verse_num, v.translation_id));

    Ok(verses)
}

// ============================================================================
// Ingest / FTS Population
// ============================================================================

use std::collections::HashMap;
use regex::Regex;

pub fn populate_terms_fts(db: &Database) -> SqliteResult<IngestResult> {
    let conn = db.conn.lock().unwrap();

    // Check if already populated
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM terms_fts",
        [],
        |row| row.get(0),
    )?;

    if count > 0 {
        return Ok(IngestResult {
            terms_indexed: 0,
            unique_terms: 0,
            already_populated: true,
        });
    }

    // Pull all verses (id, text, translation_id) in batches to avoid memory blowout
    let mut stmt = conn.prepare(
        "SELECT id, text, translation_id FROM verses",
    )?;

    let word_re = Regex::new(r"[a-zA-Z]{2,}").unwrap();

    let mut global_counts: HashMap<String, i64> = HashMap::new();

    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
    })?;

    for row in rows {
        let (_verse_id, text, _translation_id) = row?;
        for word in word_re.find_iter(&text) {
            let term = word.as_str().to_lowercase();
            *global_counts.entry(term).or_insert(0) += 1;
        }
    }

    // Batch-insert into terms_fts (FTS5 virtual table)
    let mut insert_stmt = conn.prepare(
        "INSERT INTO terms_fts (term, verse_count, translation_id) VALUES (?, ?, 0)",
    )?;

    let mut tx = conn.unchecked_transaction()?;
    let mut indexed = 0i64;

    // Commit every 5000 terms
    let batch_size = 5000;
    let entries: Vec<_> = global_counts.into_iter().collect();

    for chunk in entries.chunks(batch_size) {
        for (term, count) in chunk {
            insert_stmt.execute(params![term, count])?;
            indexed += 1;
        }
        tx.commit()?;
        // Start a new transaction for the next batch
        tx = conn.unchecked_transaction()?;
    }

    drop(insert_stmt);

    let unique_terms = indexed;

    info!(
        "terms_fts populated: {} unique terms indexed from verses",
        unique_terms
    );

    Ok(IngestResult {
        terms_indexed: indexed,
        unique_terms,
        already_populated: false,
    })
}
