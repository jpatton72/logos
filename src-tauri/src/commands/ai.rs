use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai::{chat_with_provider, ChatMessage, RateLimiter};
use crate::database::{queries, AiConversation, AiConversationSummary, Database};
use crate::secrets;

#[derive(Deserialize)]
struct AiChatInput {
    messages: Vec<ChatMessage>,
}

#[tauri::command]
pub async fn ai_chat(
    db: State<'_, Database>,
    http: State<'_, reqwest::Client>,
    rate_limiter: State<'_, RateLimiter>,
    messages_json: String,
    provider: String,
    model: String,
) -> Result<String, String> {
    // Pre-flight: refuse the call if we've issued too many AI requests in
    // the current window. Stops a runaway frontend (or a stuck retry loop)
    // from racking up unbounded provider costs.
    if let Err(retry_after) = rate_limiter.try_acquire() {
        return Err(format!(
            "Too many AI requests. Try again in {}s.",
            retry_after.as_secs().max(1),
        ));
    }

    // Read API key from the OS credential vault. Older builds stored
    // these in the preferences table; the startup migration moves them on
    // upgrade so most users will already have a keyring entry by the time
    // this runs. The `db` State is still threaded in here for future
    // commands and for symmetry with other AI flows.
    let _ = &db;
    let api_key = secrets::get_api_key(&provider)
        .map_err(|e| e.to_string())?
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            format!(
                "No API key found for provider '{}'. Add your API key in Settings.",
                provider
            )
        })?;

    // Parse messages
    let input: AiChatInput =
        serde_json::from_str(&messages_json).map_err(|e| format!("Invalid messages JSON: {}", e))?;

    // Reuse the long-lived HTTP client from AppState — keeps the connection
    // pool warm across consecutive AI requests.
    let response = chat_with_provider(&http, &provider, input.messages, &model, &api_key)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.content)
}

/// Stores an API key for `provider` in the OS credential vault. Saving an
/// empty string deletes any existing entry, so the Settings UI can clear
/// a key by submitting a blank value.
#[tauri::command]
pub fn set_api_key(provider: String, key: String) -> Result<(), String> {
    secrets::set_api_key(&provider, &key).map_err(|e| e.to_string())
}

/// Returns `true` if a non-empty key is stored for `provider`. The UI
/// uses this to render a "saved" indicator without round-tripping the
/// cleartext secret through the renderer process.
#[tauri::command]
pub fn has_api_key(provider: String) -> Result<bool, String> {
    secrets::has_api_key(&provider).map_err(|e| e.to_string())
}

/// Removes the stored API key for `provider`. Idempotent.
#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    secrets::delete_api_key(&provider).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// AI conversation history
// ---------------------------------------------------------------------------

/// Upsert an AI conversation. `id = None` creates a new row and returns
/// its rowid; `id = Some(...)` replaces the body of an existing row.
/// Auto-saved on every assistant turn from the frontend so closing the
/// panel or quitting the app doesn't lose work.
#[tauri::command]
pub fn save_ai_conversation(
    db: State<'_, Database>,
    id: Option<i64>,
    title: Option<String>,
    messages_json: String,
    verse_context_json: Option<String>,
    word_context_json: Option<String>,
    provider: Option<String>,
    model: Option<String>,
) -> Result<i64, String> {
    queries::save_ai_conversation(
        &db,
        id,
        title.as_deref(),
        &messages_json,
        verse_context_json.as_deref(),
        word_context_json.as_deref(),
        provider.as_deref(),
        model.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct PaginatedAiConversations {
    pub items: Vec<AiConversationSummary>,
    pub total: i64,
}

#[tauri::command]
pub fn list_ai_conversations(
    db: State<'_, Database>,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<PaginatedAiConversations, String> {
    let effective_limit = limit.or(Some(100));
    let items = queries::list_ai_conversations(&db, effective_limit, offset)
        .map_err(|e| e.to_string())?;
    let total = queries::count_ai_conversations(&db).map_err(|e| e.to_string())?;
    Ok(PaginatedAiConversations { items, total })
}

#[tauri::command]
pub fn get_ai_conversation(
    db: State<'_, Database>,
    id: i64,
) -> Result<Option<AiConversation>, String> {
    queries::get_ai_conversation(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_ai_conversation(db: State<'_, Database>, id: i64) -> Result<(), String> {
    queries::delete_ai_conversation(&db, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_ai_conversation_title(
    db: State<'_, Database>,
    id: i64,
    title: Option<String>,
) -> Result<(), String> {
    queries::update_ai_conversation_title(&db, id, title.as_deref()).map_err(|e| e.to_string())
}
