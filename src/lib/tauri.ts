import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Data Types
// ============================================================================

export interface Book {
  id: number;
  abbreviation: string;
  full_name: string;
  testament: string; // "ot" | "nt" from DB; "OT" | "NT" in mock data
  genre: string;
  order_index: number;
}

export interface Translation {
  id: number;
  name: string;
  abbreviation: string;
  language: "hebrew" | "greek" | "english";
  source_url: string | null;
  notes: string | null;
}

export interface Verse {
  id: number;
  book_id: number;
  book_abbreviation: string;
  chapter: number;
  verse_num: number;
  translation_id: number;
  text: string;
  translation_abbreviation?: string; // populated when returned from get_chapter
}

export interface VerseGroup {
  chapter: number;
  verse_num: number;
  verses: Verse[];  // matches Rust VerseGroup { chapter, verse_num, verses: Vec<Verse> }
}

export interface TranslationText {
  translation_id: number;
  translation_abbreviation: string;
  translation_name: string;
  text: string;
}

export interface Bookmark {
  id: number;
  verse_id: number;
  label: string | null;
  created_at: string;
}

export interface BookmarkVerseSummary {
  id: number;
  book_id: number;
  book_abbreviation: string;
  chapter: number;
  verse_num: number;
  translation_id: number;
  translation_abbreviation: string;
  text: string;
}

export interface BookmarkWithVerse {
  id: number;
  verse_id: number;
  label: string | null;
  created_at: string;
  verse: BookmarkVerseSummary;
}

export interface Note {
  id: number;
  verse_id: number | null;
  title: string | null;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface StrongsGreek {
  id: string;
  word: string;
  transliteration: string;
  definition: string;
  pronunciation: string | null;
}

export interface StrongsHebrew {
  id: string;
  word: string;
  ketiv_qere: string | null;
  transliteration: string;
  definition: string;
  pronunciation: string | null;
}

export interface WordMapping {
  id: number;
  verse_id: number;
  word_index: number;
  strongs_id: string;
  original_word: string;
  lemma: string | null;
  morphology: string | null;
  language: "hebrew" | "greek";
}

/** A Verse with its per-word original-language mappings attached.
 *  Returned by `getChapterOriginals`. The `word_mappings` field is
 *  optional because verses fetched via `getChapter` (English text)
 *  don't carry it. */
export interface VerseWithWords extends Verse {
  word_mappings?: WordMapping[];
}

export interface SearchResult {
  verse_id: number;
  book_abbreviation: string;
  book_name: string;
  chapter: number;
  verse_num: number;
  text: string;
  translation_abbreviation: string;
  rank?: number;
}

export interface TermResult {
  term: string;
  verse_count: number;
  translations: number[];
}

export interface KetivQere {
  ketiv: string;
  qere: string;
}

export interface CompareResult {
  book_abbreviation: string;
  chapter: number;
  verse_num: number;
  translations: Verse[];
}

export interface ReadingProgressEntry {
  book_id: number;
  chapter: number;
  last_read_at: string;
}

// Mirrors src-tauri/src/commands/export.rs::ExportedNote.
export interface ExportedNote {
  id: number;
  title: string | null;
  content: string;
  tags: string[];
  verse_ref: string | null;
  created_at: string;
  updated_at: string;
}

// Mirrors src-tauri/src/commands/export.rs::ExportedBookmark.
export interface ExportedBookmark {
  id: number;
  label: string | null;
  verse_ref: string;
  verse_text: string;
  created_at: string;
}

// Mirrors src-tauri/src/commands/export.rs::ExportData.
export interface ExportData {
  notes: ExportedNote[];
  bookmarks: ExportedBookmark[];
  exported_at: string;
}

export async function exportNotesAndBookmarks(): Promise<ExportData> {
  return invoke<ExportData>('export_notes_and_bookmarks');
}

// ============================================================================
// Verse Commands
// ============================================================================

export async function getVerse(
  book: string,
  chapter: number,
  verse: number,
  translation: string
): Promise<Verse | null> {
  return invoke<Verse | null>("get_verse", { book, chapter, verse, translation });
}

export async function getChapter(
  book: string,
  chapter: number,
  translations: string[]
): Promise<VerseGroup[]> {
  return invoke<VerseGroup[]>("get_chapter", { book, chapter, translations });
}

export async function getBookIndex(): Promise<Book[]> {
  return invoke<Book[]>("get_book_index");
}

/** Returns `{ abbreviation: max_chapter }` for every book that has verses
 *  loaded. Cached on the frontend so chapter counts always match the DB
 *  rather than a hand-maintained constant. */
export async function getChapterCounts(): Promise<Record<string, number>> {
  return invoke<Record<string, number>>("get_chapter_counts");
}

export async function compareVerses(
  book: string,
  chapter: number,
  verse: number,
  translations: string[]
): Promise<CompareResult> {
  return invoke<CompareResult>("compare_verses", {
    book,
    chapter,
    verse,
    translations,
  });
}

// ============================================================================
// Search Commands
// ============================================================================

export async function searchVerses(
  query: string,
  translation?: string,
  limit?: number,
  testament?: string,
  genre?: string,
  sort?: string
): Promise<SearchResult[]> {
  // limit === undefined or 0 means "no limit" on the Rust side.
  return invoke<SearchResult[]>("search_verses", {
    query,
    filters: {
      translation: translation ?? null,
      testament: testament ?? null,
      genre: genre ?? null,
    },
    options: {
      sort: sort ?? null,
    },
    limit: limit && limit > 0 ? limit : null,
  });
}

export async function searchTerms(
  query: string,
  minFrequency: number = 3
): Promise<TermResult[]> {
  return invoke<TermResult[]>("search_terms", {
    query,
    min_frequency: minFrequency,
  });
}

// ============================================================================
// Bookmark Commands
// ============================================================================

export async function createBookmark(
  verseId: number,
  label?: string
): Promise<Bookmark> {
  return invoke<Bookmark>("create_bookmark", {
    verseId,
    label: label ?? null,
  });
}

export interface PaginatedBookmarks {
  items: BookmarkWithVerse[];
  total: number;
}

export async function getBookmarks(
  limit?: number,
  offset?: number,
): Promise<PaginatedBookmarks> {
  return invoke<PaginatedBookmarks>("get_bookmarks", {
    limit: limit ?? null,
    offset: offset ?? null,
  });
}

export async function deleteBookmark(id: number): Promise<void> {
  return invoke<void>("delete_bookmark", { id });
}

// ============================================================================
// Note Commands
// ============================================================================

export async function createNote(
  content: string,
  verseId?: number,
  title?: string,
  tags: string[] = []
): Promise<Note> {
  return invoke<Note>("create_note", {
    verseId: verseId ?? null,
    title: title ?? null,
    content,
    tags,
  });
}

export interface PaginatedNotes {
  items: Note[];
  total: number;
}

export async function getNotes(
  verseId?: number,
  limit?: number,
  offset?: number,
): Promise<PaginatedNotes> {
  return invoke<PaginatedNotes>("get_notes", {
    verseId: verseId ?? null,
    limit: limit ?? null,
    offset: offset ?? null,
  });
}

export async function updateNote(
  id: number,
  content: string,
  title?: string,
  tags: string[] = []
): Promise<Note> {
  return invoke<Note>("update_note", {
    id,
    title: title ?? null,
    content,
    tags,
  });
}

export async function deleteNote(id: number): Promise<void> {
  return invoke<void>("delete_note", { id });
}

export async function searchNotes(query: string): Promise<Note[]> {
  return invoke<Note[]>("search_notes", { query });
}

// ============================================================================
// Lexicon Commands
// ============================================================================

export async function getStrongsGreek(id: string): Promise<StrongsGreek | null> {
  return invoke<StrongsGreek | null>("get_strongs_greek", { id });
}

export async function getStrongsHebrew(id: string): Promise<StrongsHebrew | null> {
  return invoke<StrongsHebrew | null>("get_strongs_hebrew", { id });
}

export async function getVerseWords(verseId: number): Promise<WordMapping[]> {
  return invoke<WordMapping[]>("get_verse_words", { verseId });
}

/** One ranked Strong's candidate returned by `lookupEnglishTerm`. */
export interface EnglishStrongsResult {
  strongs_id: string;
  language: "hebrew" | "greek";
  frequency: number;
  original_word: string | null;
  transliteration: string | null;
  definition: string | null;
  sample_book_abbreviation: string | null;
  sample_book_name: string | null;
  sample_chapter: number | null;
  sample_verse: number | null;
}

/** Look up an English KJV word and return ranked Strong's candidates with
 *  their lexicon entries and one example reference per candidate. */
export async function lookupEnglishTerm(
  term: string,
  limit?: number,
): Promise<EnglishStrongsResult[]> {
  return invoke<EnglishStrongsResult[]>("lookup_english_term", {
    term,
    limit: limit ?? null,
  });
}

// ============================================================================
// Original Language Commands
// ============================================================================

export async function getChapterOriginals(book: string, chapter: number): Promise<VerseWithWords[]> {
  return invoke<VerseWithWords[]>("get_chapter_originals", { book, chapter });
}

export async function getKetivQere(
  book: string,
  chapter: number,
  verse: number
): Promise<KetivQere[]> {
  return invoke<KetivQere[]>("get_ketiv_qere", { book, chapter, verse });
}

// ============================================================================
// Preference Commands
// ============================================================================

export async function getPreference(key: string): Promise<string | null> {
  return invoke<string | null>("get_preference", { key });
}

export async function setPreference(key: string, value: string): Promise<void> {
  return invoke<void>("set_preference", { key, value });
}

// ============================================================================
// API Key (OS Credential Vault) Commands
// ============================================================================
//
// API keys are stored in the OS credential vault (Windows Credential Manager
// / macOS Keychain / Linux Secret Service), never in the SQLite preferences
// table. The renderer process never reads back the cleartext value — only
// `hasApiKey` to decide whether to render a "saved" placeholder.

/** Stores or replaces the API key for `provider`. Saving an empty string
 *  deletes any existing entry. */
export async function setApiKey(provider: string, key: string): Promise<void> {
  return invoke<void>("set_api_key", { provider, key });
}

/** `true` if a non-empty key is stored for `provider`. */
export async function hasApiKey(provider: string): Promise<boolean> {
  return invoke<boolean>("has_api_key", { provider });
}

/** Removes the stored API key for `provider`, if any. Idempotent. */
export async function deleteApiKey(provider: string): Promise<void> {
  return invoke<void>("delete_api_key", { provider });
}

// ============================================================================
// Progress Commands
// ============================================================================

export async function getReadingProgress(): Promise<ReadingProgressEntry[]> {
  return invoke<ReadingProgressEntry[]>("get_reading_progress");
}

export async function updateReadingProgress(
  bookId: number,
  chapter: number
): Promise<void> {
  return invoke<void>("update_reading_progress", { bookId, chapter });
}

// ============================================================================
// Ingest Commands
// ============================================================================

export interface IngestResult {
  terms_indexed: number;
  unique_terms: number;
  already_populated: boolean;
}

export async function populateTermsFts(): Promise<IngestResult> {
  return invoke<IngestResult>("populate_terms_fts");
}
