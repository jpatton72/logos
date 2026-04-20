use serde::Deserialize;
use tauri::State;

use crate::ai::{chat_with_provider, ChatMessage};
use crate::database::{queries, Database};

#[derive(Deserialize)]
struct AiChatInput {
    messages: Vec<ChatMessage>,
}

#[tauri::command]
pub async fn ai_chat(
    db: State<'_, Database>,
    messages_json: String,
    provider: String,
    model: String,
) -> Result<String, String> {
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

    // Call the provider
    let response = chat_with_provider(&provider, input.messages, &model, &api_key)
        .await
        .map_err(|e| e.to_string())?;

    Ok(response.content)
}
