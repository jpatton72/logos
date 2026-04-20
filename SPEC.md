# Logos — Bible Study Application

## Overview

Logos is a production-ready, local-first Bible study application built with Tauri. It provides deep linguistic analysis of the original Hebrew and Greek texts alongside multiple English translations, with optional AI-powered assistance.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Tauri 2.x (Rust)
- **Database:** SQLite 3 + FTS5
- **AI Providers:** Pluggable interface (OpenAI, Anthropic, Google, Groq, Ollama)
- **Build:** Tauri bundler (`.deb`, `.msi`, `.app`)

## Data Sources

| Source | Language | License | Format |
|--------|----------|---------|--------|
| OSHB | Hebrew | Open Translation License 1.5 | OSIS XML |
| SBLGNT | Greek | SBL Font License | JSON |
| KJV | English | Public Domain | CSV/JSON |
| NKJV | English | Permissive | CSV/JSON |
| ESV | English | CrossWire/ESV terms | CSV/JSON |

## Database Schema

### Core Tables

```sql
-- Book metadata
CREATE TABLE books (
    id INTEGER PRIMARY KEY,
    abbreviation TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    testament TEXT NOT NULL CHECK (testament IN ('ot', 'nt')),
    genre TEXT NOT NULL,
    order_index INTEGER NOT NULL
);

-- Translation metadata
CREATE TABLE translations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT UNIQUE NOT NULL,
    language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek', 'english')),
    source_url TEXT,
    notes TEXT
);

-- One row per verse per translation
CREATE TABLE verses (
    id INTEGER PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id),
    chapter INTEGER NOT NULL,
    verse_num INTEGER NOT NULL,
    translation_id INTEGER NOT NULL REFERENCES translations(id),
    text TEXT NOT NULL,
    UNIQUE(book_id, chapter, verse_num, translation_id)
);

-- Index for fast verse lookup
CREATE INDEX idx_verses_ref ON verses(book_id, chapter, verse_num);
CREATE INDEX idx_verses_translation ON verses(translation_id);
```

### Lexicon Tables

```sql
-- Strong's Greek dictionary
CREATE TABLE strongs_greek (
    id TEXT PRIMARY KEY,           -- e.g., "G1234"
    word TEXT NOT NULL,            -- Greek word in Greek script
    transliteration TEXT NOT NULL, -- e.g., "logos"
    definition TEXT NOT NULL,
    pronunciation TEXT              -- URL to audio file (optional)
);

-- Strong's Hebrew dictionary
CREATE TABLE strongs_hebrew (
    id TEXT PRIMARY KEY,           -- e.g., "H1234"
    word TEXT NOT NULL,            -- Hebrew word (Ketiv form)
    ketiv_qere TEXT,               -- Qere form if different
    transliteration TEXT NOT NULL,
    definition TEXT NOT NULL,
    pronunciation TEXT
);

-- Word-level mapping: connects verse words to Strong's entries
CREATE TABLE word_mappings (
    id INTEGER PRIMARY KEY,
    verse_id INTEGER NOT NULL REFERENCES verses(id),
    word_index INTEGER NOT NULL,   -- Position in verse (0-based)
    strongs_id TEXT NOT NULL,
    original_word TEXT NOT NULL,
    lemma TEXT,                     -- Dictionary form
    morphology TEXT,               -- e.g., "N-NMS" (noun, nominative masculine singular)
    language TEXT NOT NULL CHECK (language IN ('hebrew', 'greek')),
    UNIQUE(verse_id, word_index)
);

CREATE INDEX idx_word_mappings_verse ON word_mappings(verse_id);
CREATE INDEX idx_word_mappings_strongs ON word_mappings(strongs_id);
```

### User Data Tables

```sql
-- Bookmarks
CREATE TABLE bookmarks (
    id INTEGER PRIMARY KEY,
    verse_id INTEGER NOT NULL REFERENCES verses(id),
    label TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(verse_id)
);

-- Notes
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    verse_id INTEGER REFERENCES verses(id),
    title TEXT,
    content TEXT NOT NULL,
    tags TEXT,                      -- JSON array of strings
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_notes_verse ON notes(verse_id);

-- User preferences
CREATE TABLE user_preferences (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Reading progress
CREATE TABLE reading_progress (
    book_id INTEGER PRIMARY KEY REFERENCES books(id),
    chapter INTEGER NOT NULL DEFAULT 1,
    last_read_at TEXT DEFAULT (datetime('now'))
);
```

### FTS5 Full-Text Search Tables

```sql
-- Full-text search over all verse texts
CREATE VIRTUAL TABLE verses_fts USING fts5(
    verse_id UNINDEXED,
    book_id,
    chapter,
    verse_num,
    text,
    translation_id,
    tokenize='unicode61 remove_diacritics 1'
);

-- Term frequency index: all terms appearing more than 2 times
CREATE VIRTUAL TABLE terms_fts USING fts5(
    term,
    verse_count INTEGER,
    translation_id,
    tokenize='unicode61 remove_diacritics 1'
);
```

## Tauri Command Interface (Rust)

### Commands to implement

```rust
// Verse retrieval
#[tauri::command] fn get_verse(book: &str, chapter: u32, verse: u32, translation: &str) -> Result<Verse, String>
#[tauri::command] fn get_chapter(book: &str, chapter: u32, translations: Vec<&str>) -> Result<Vec<VerseGroup>, String>
#[tauri::command] fn get_book_index() -> Result<Vec<Book>, String>

// Search
#[tauri::command] fn search_verses(query: &str, translation: Option<&str>, limit: u32) -> Result<Vec<SearchResult>, String>
#[tauri::command] fn search_terms(query: &str, min_frequency: u32) -> Result<Vec<TermResult>, String>

// Bookmarks & Notes
#[tauri::command] fn create_bookmark(verse_id: i64, label: Option<&str>) -> Result<Bookmark, String>
#[tauri::command] fn get_bookmarks() -> Result<Vec<BookmarkWithVerse>, String>
#[tauri::command] fn delete_bookmark(id: i64) -> Result<(), String>
#[tauri::command] fn create_note(verse_id: Option<i64>, title: Option<&str>, content: &str, tags: Vec<&str>) -> Result<Note, String>
#[tauri::command] fn get_notes(verse_id: Option<i64>) -> Result<Vec<Note>, String>
#[tauri::command] fn update_note(id: i64, title: Option<&str>, content: &str, tags: Vec<&str>) -> Result<Note, String>
#[tauri::command] fn delete_note(id: i64) -> Result<(), String>
#[tauri::command] fn search_notes(query: &str) -> Result<Vec<Note>, String>

// Lexicon
#[tauri::command] fn get_strongs_greek(id: &str) -> Result<StrongsGreek, String>
#[tauri::command] fn get_strongs_hebrew(id: &str) -> Result<StrongsHebrew, String>
#[tauri::command] fn get_verse_words(verse_id: i64) -> Result<Vec<WordMapping>, String>

// Translation comparison
#[tauri::command] fn compare_verses(book: &str, chapter: u32, verse: u32, translations: Vec<&str>) -> Result<CompareResult, String>

// Preferences
#[tauri::command] fn get_preference(key: &str) -> Result<Option<String>, String>
#[tauri::command] fn set_preference(key: &str, value: &str) -> Result<(), String>
```

## Project Structure

```
logos/
├── src/                          # React frontend
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   │   ├── Reader.tsx            # Main Bible reading view
│   │   ├── Compare.tsx           # Side-by-side translation comparison
│   │   ├── Search.tsx            # Full-text + term search
│   │   ├── Lexicon.tsx           # Greek/Hebrew word study
│   │   ├── Notes.tsx             # Notes + bookmarks manager
│   │   └── Settings.tsx          # API keys, preferences
│   ├── components/
│   │   ├── VerseRenderer.tsx     # Smart text with word tooltips
│   │   ├── WordHover.tsx         # Strong's popup on hover
│   │   ├── TranslationBar.tsx    # Version picker
│   │   ├── BookNav.tsx           # Book/chapter navigation
│   │   ├── VerseSelector.tsx     # Click verse to select for AI
│   │   └── AiAssistant.tsx       # AI chat panel
│   ├── hooks/
│   │   ├── useVerse.ts
│   │   ├── useSearch.ts
│   │   ├── useBookmarks.ts
│   │   └── useAi.ts
│   ├── lib/
│   │   ├── tauri.ts              # Tauri invoke wrappers
│   │   ├── ai.ts                 # AI provider abstraction
│   │   └── db.ts                 # Local state helpers
│   └── styles/
│       └── globals.css
├── src-tauri/                    # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── mod.rs
│   │   │   ├── verses.rs
│   │   │   ├── search.rs
│   │   │   ├── bookmarks.rs
│   │   │   ├── notes.rs
│   │   │   ├── lexicon.rs
│   │   │   └── preferences.rs
│   │   ├── database/
│   │   │   ├── mod.rs
│   │   │   ├── connection.rs
│   │   │   ├── migrations.rs
│   │   │   └── queries.rs
│   │   └── ai/
│   │       ├── mod.rs
│   │       └── providers.rs
├── data/                         # Bible data (gitignored)
│   ├── oshb.xml                  # Hebrew OSIS XML
│   ├── sblgnt.json              # Greek JSON
│   ├── kjv.json
│   ├── nkjv.json
│   └── esv.json
├── scripts/
│   └── ingest.py                 # Data ingestion pipeline
├── SPEC.md
└── README.md
```

## Phase Breakdown

### Phase 1 — Core Infrastructure
- [x] Initialize Tauri project with React + TypeScript + Vite
- [x] Set up logging (tracing + env_logger)
- [x] SQLite database initialization with schema
- [x] Data ingestion pipeline (KJV, SBLGNT, WLC — 62,130 verses across 3 translations)
- [x] Basic verse retrieval by reference
- [x] FTS5 full-text search over all verses
- [x] Database migrations system

**Database contents:** 66 books, 3 translations (KJV, SBLGNT, WLC), 62,130 verses, 5,523 Greek Strong's entries, 8,674 Hebrew Strong's entries, 105,893 word mappings, 912 Ketiv/Qere pairs, verses_fts + terms_fts populated.

### Phase 2 — Reading & Navigation
- [x] Main reader view with chapter/verse display
- [x] Book/chapter navigation sidebar
- [x] Translation switching
- [x] Reading progress tracking
- [x] Dark mode

### Phase 3 — Search
- [x] Full-text search across all translations (FTS5)
- [x] Term frequency index (terms appearing 2+ times — 12,425 terms)
- [x] Sort by relevance, book order
- [x] Filter by translation, testament, genre
- [x] Frequency sort option wired to UI (Sort dropdown → "frequency" added to sort options)

### Phase 4 — Translation Comparison
- [x] Side-by-side view (2–4 translations) — Compare.tsx
- [x] Synchronized scrolling
- [x] Copy verse references
- [x] Original language word display with Strong's hover

### Phase 5 — Greek & Hebrew
- [x] Word-by-word breakdown on any verse
- [x] Strong's number lookup with full dictionary entry
- [x] Parsed form display (lemma, morphology)
- [x] Hover tooltips on original language words
- [x] Hebrew Ketiv/Qere handling (912 pairs loaded)

### Phase 6 — Notes & Bookmarks
- [x] Bookmark any verse with labels
- [x] Attach notes to verses
- [x] Tag system for notes
- [x] Notes panel on reader view
- [x] Full-text search within notes (client-side filter + backend search_notes command)

### Phase 7 — AI Integration
- [ ] Provider abstraction layer (see TASKS.md Task 1)
- [ ] Settings UI for API keys
- [ ] Context-aware AI chat on selected verse(s)
- [ ] Suggested related passages
- [ ] Translation explanations for original language words

### Phase 8 — Polish & Production
- [x] Keyboard shortcuts (see TASKS.md Task 3)
- [x] Export notes/bookmarks (see TASKS.md Task 3)
- [ ] Performance optimization
- [ ] App icon, installer, auto-updates

## Verification Criteria

Each phase must pass:
1. Code compiles without errors
2. All new commands return correct data types
3. Database queries execute without errors
4. Unit tests pass for new functionality
5. No panics in Tauri commands under normal use

## Notes

- API keys stored via Tauri's secret store (platform keyring)
- All Bible data is bundled/read-only at runtime
- Database file lives in Tauri app data directory
- Original language texts must render with proper RTL support for Hebrew
