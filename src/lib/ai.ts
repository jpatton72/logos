import { invoke } from "@tauri-apps/api/core";

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ============================================================================
// AI Chat
// ============================================================================

/**
 * Send a chat message to the configured AI provider via the Rust backend.
 * The backend reads the API key from user_preferences based on the provider.
 */
export async function aiChat(
  messages: ChatMessage[],
  provider: string,
  model: string
): Promise<string> {
  return invoke<string>("ai_chat", {
    messagesJson: JSON.stringify({ messages }),
    provider,
    model,
  });
}
