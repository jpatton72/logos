//! AI Provider abstraction layer.
//!
//! Supports: OpenAI, Anthropic, Google AI, Groq, Ollama.

mod providers;

pub use providers::*;

// Re-export ChatMessage so commands can use it
pub use providers::ChatMessage;

/// Unified AI request payload used by all providers internally.
#[derive(Debug, Clone)]
pub struct AiRequest {
    pub messages: Vec<ChatMessage>,
    pub model: String,
}

impl AiRequest {
    pub fn new(messages: Vec<ChatMessage>, model: String) -> Self {
        Self { messages, model }
    }
}

/// Unified AI response from all providers.
#[derive(Debug, Clone)]
pub struct AiResponse {
    pub content: String,
}

/// Errors that can occur during AI communication.
#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("Provider '{0}' is not supported")]
    UnsupportedProvider(String),

    #[error("HTTP request failed: {0}")]
    HttpError(#[from] reqwest::Error),

    #[error("API error ({status}): {message}")]
    ApiError { status: u16, message: String },

    #[error("Missing API key for provider '{0}'")]
    MissingApiKey(String),

    #[error("Failed to parse response: {0}")]
    ParseError(String),

    #[error("No content in response")]
    EmptyResponse,

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
}
