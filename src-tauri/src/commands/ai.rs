use serde::Deserialize;
use tauri::State;

use crate::ai::{chat_with_provider, ChatMessage, RateLimiter};
use crate::database::{queries, Database};

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

    // Read API key from preferences via queries module
    let key_name = format!("api_key_{}", provider);
    let api_key = queries::get_preference(&db, &key_name)
        .map_err(|e| e.to_string())?
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
