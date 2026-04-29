use rusqlite::Connection;
use tracing::info;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    info!("Running database migrations");

    // Create books table.
    // testament: 'ot' (Old Testament), 'nt' (New Testament), 'apoc' (Apocrypha / non-canonical).
    conn.execute(
        "CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            abbreviation TEXT UNIQUE NOT NULL,
            full_name TEXT NOT NULL,
            testament TEXT NOT NULL CHECK (testament IN ('ot', 'nt', 'apoc')),
            genre TEXT NOT NULL,
            order_index INTEGER NOT NULL
        )",
        [],
    )?;

    // Create translations table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS translations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            abbreviation TEXT UNIQUE NOT NULL,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek', 'english')),
            source_url TEXT,
            notes TEXT
        )",
        [],
    )?;

    // Create verses table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS verses (
            id INTEGER PRIMARY KEY,
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse_num INTEGER NOT NULL,
            translation_id INTEGER NOT NULL REFERENCES translations(id),
            text TEXT NOT NULL,
            UNIQUE(book_id, chapter, verse_num, translation_id)
        )",
        [],
    )?;

    // Create indexes for verses
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_verses_ref ON verses(book_id, chapter, verse_num)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_verses_translation ON verses(translation_id)",
        [],
    )?;

    // Create Strong's Greek table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS strongs_greek (
            id TEXT PRIMARY KEY,
            word TEXT NOT NULL,
            transliteration TEXT NOT NULL,
            definition TEXT NOT NULL,
            pronunciation TEXT
        )",
        [],
    )?;

    // Create Strong's Hebrew table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS strongs_hebrew (
            id TEXT PRIMARY KEY,
            word TEXT NOT NULL,
            ketiv_qere TEXT,
            transliteration TEXT NOT NULL,
            definition TEXT NOT NULL,
            pronunciation TEXT
        )",
        [],
    )?;

    // Create word mappings table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS word_mappings (
            id INTEGER PRIMARY KEY,
            verse_id INTEGER NOT NULL REFERENCES verses(id),
            word_index INTEGER NOT NULL,
            strongs_id TEXT NOT NULL,
            original_word TEXT NOT NULL,
            lemma TEXT,
            morphology TEXT,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
            UNIQUE(verse_id, word_index)
        )",
        [],
    )?;

    // Create indexes for word mappings
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_word_mappings_verse ON word_mappings(verse_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_word_mappings_strongs ON word_mappings(strongs_id)",
        [],
    )?;

    // Create bookmarks table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY,
            verse_id INTEGER NOT NULL REFERENCES verses(id),
            label TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(verse_id)
        )",
        [],
    )?;

    // Create notes table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY,
            verse_id INTEGER REFERENCES verses(id),
            title TEXT,
            content TEXT NOT NULL,
            tags TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_verse ON notes(verse_id)",
        [],
    )?;

    // Create ketiv_qere table — verse-level K/Q annotations from Sefaria Masorah
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ketiv_qere (
            id INTEGER PRIMARY KEY,
            book_id INTEGER NOT NULL REFERENCES books(id),
            chapter INTEGER NOT NULL,
            verse_num INTEGER NOT NULL,
            ketiv TEXT NOT NULL,
            qere TEXT NOT NULL,
            UNIQUE(book_id, chapter, verse_num, ketiv)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ketiv_qere_ref ON ketiv_qere(book_id, chapter, verse_num)",
        [],
    )?;

    // Create user preferences table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS user_preferences (
            key TEXT PRIMARY KEY,
            value TEXT
        )",
        [],
    )?;

    // Create reading progress table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reading_progress (
            book_id INTEGER PRIMARY KEY REFERENCES books(id),
            chapter INTEGER NOT NULL DEFAULT 1,
            last_read_at TEXT DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // Create FTS5 virtual tables
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
            verse_id UNINDEXED,
            book_id,
            chapter,
            verse_num,
            text,
            translation_id,
            tokenize='unicode61 remove_diacritics 1'
        )",
        [],
    )?;

    // Create terms_fts virtual table for term frequency search
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS terms_fts USING fts5(
            term,
            verse_count,
            translation_id
        )",
        [],
    )?;

    info!("Database migrations completed successfully");
    Ok(())
}
