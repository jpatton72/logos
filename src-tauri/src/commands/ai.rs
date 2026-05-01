use serde::Deserialize;
use tauri::State;

use crate::ai::{chat_with_provider, ChatMessage, RateLimiter};
use crate::database::Database;
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
