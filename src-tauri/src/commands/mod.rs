pub mod ai;
pub mod bookmarks;
pub mod export;
pub mod ingest;
pub mod lexicon;
pub mod notes;
pub mod preferences;
pub mod progress;
pub mod search;
pub mod verses;

pub use bookmarks::{create_bookmark, delete_bookmark, get_bookmarks};
pub use export::export_notes_and_bookmarks;
pub use ingest::populate_terms_fts;
pub use lexicon::{get_strongs_greek, get_strongs_hebrew, get_verse_words, lookup_english_term};
pub use notes::{create_note, delete_note, get_notes, search_notes, update_note};
pub use preferences::{get_preference, set_preference};
pub use progress::{get_reading_progress, update_reading_progress};
pub use search::{search_terms, search_verses};
pub use verses::{compare_verses, get_book_index, get_chapter, get_chapter_counts, get_chapter_originals, get_ketiv_qere, get_verse};

pub use ai::{
    ai_chat, delete_ai_conversation, delete_api_key, get_ai_conversation, has_api_key,
    list_ai_conversations, save_ai_conversation, set_api_key, update_ai_conversation_title,
};
