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

    // Full-text index over the user's notes. Title + content + tags are
    // searched together. Triggers below keep notes_fts in lock-step with
    // the notes table so search_notes() can use a single MATCH query
    // instead of three LIKE '%q%' scans.
    conn.execute(
        "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
            note_id UNINDEXED,
            title,
            content,
            tags,
            tokenize='unicode61 remove_diacritics 1'
        )",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS notes_after_insert AFTER INSERT ON notes BEGIN
            INSERT INTO notes_fts (note_id, title, content, tags)
            VALUES (NEW.id, COALESCE(NEW.title, ''), NEW.content, COALESCE(NEW.tags, ''));
         END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS notes_after_update AFTER UPDATE ON notes BEGIN
            UPDATE notes_fts
               SET title = COALESCE(NEW.title, ''),
                   content = NEW.content,
                   tags = COALESCE(NEW.tags, '')
             WHERE note_id = NEW.id;
         END",
        [],
    )?;
    conn.execute(
        "CREATE TRIGGER IF NOT EXISTS notes_after_delete AFTER DELETE ON notes BEGIN
            DELETE FROM notes_fts WHERE note_id = OLD.id;
         END",
        [],
    )?;
    // One-time backfill so existing notes are searchable without
    // requiring users to edit every note.
    conn.execute(
        "INSERT INTO notes_fts (note_id, title, content, tags)
         SELECT n.id, COALESCE(n.title, ''), n.content, COALESCE(n.tags, '')
         FROM notes n
         WHERE NOT EXISTS (SELECT 1 FROM notes_fts f WHERE f.note_id = n.id)",
        [],
    )?;

    // Schema version metadata. A single-row table the app and the Python
    // ingest scripts both consult to detect old DBs and decide whether to
    // run targeted data migrations (e.g. relaxing the books.testament
    // CHECK constraint to allow apocryphal entries). Bump CURRENT_SCHEMA
    // below whenever the schema changes in a way that needs a migration.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            version INTEGER NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
        )",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, ?)",
        [CURRENT_SCHEMA],
    )?;

    // English-to-Strong's index. Each row says "the lowercased English
    // word X corresponds to Strong's Y in the KJV N times, with one
    // example reference." Built from eBible.org's eng-kjv2006 USFM
    // (Public Domain) by `scripts/ingest_kjv_strongs.py`. Used by the
    // Lexicon page's English-lookup feature to rank Strong's candidates
    // for a given English word.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS english_strongs_index (
            id INTEGER PRIMARY KEY,
            english_word TEXT NOT NULL,
            strongs_id TEXT NOT NULL,
            language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
            frequency INTEGER NOT NULL,
            sample_book_id INTEGER REFERENCES books(id),
            sample_chapter INTEGER,
            sample_verse INTEGER,
            UNIQUE(english_word, strongs_id)
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_english_strongs_word ON english_strongs_index(english_word)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_english_strongs_strongs ON english_strongs_index(strongs_id)",
        [],
    )?;

    // Saved AI conversations. Each row is one chat thread the user has
    // built up in the AI panel. Messages are stored as a JSON array;
    // the verse_context / word_context columns capture what was
    // selected when the chat started so the UI can re-render the
    // surrounding state if the user reloads the chat. Auto-saved on
    // every assistant turn — Discard removes the row, Clear just
    // resets the in-memory chat without touching saved history.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ai_conversations (
            id INTEGER PRIMARY KEY,
            title TEXT,
            messages TEXT NOT NULL,
            verse_context TEXT,
            word_context TEXT,
            provider TEXT,
            model TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations(updated_at DESC)",
        [],
    )?;

    info!("Database migrations completed successfully");
    Ok(())
}

/// Bump on schema-affecting changes:
///   1 = initial release
///   2 = books.testament CHECK relaxed to allow 'apoc'
///   3 = added english_strongs_index for KJV->Strong's lookup
///   4 = added ai_conversations for AI chat history
pub const CURRENT_SCHEMA: i32 = 4;
