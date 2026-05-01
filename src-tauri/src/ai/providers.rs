//! AI Provider implementations: OpenAI, Anthropic, Google, Groq, Ollama.

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

use super::{AiError, AiResponse};

/// A chat message in provider-agnostic format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

// ============================================================================
// Provider trait (async)
// ============================================================================

#[allow(async_fn_in_trait)]
pub trait Provider: Send + Sync {
    /// Return the base URL for the provider's chat completions endpoint.
    fn endpoint(&self) -> &str;

    /// Return the header name for the API key (e.g. "Authorization", "x-api-key").
    fn api_key_header(&self) -> (&str, &str) {
        ("Authorization", "Bearer ")
    }

    /// Build provider-specific request headers given the API key.
    ///
    /// Returns InvalidConfig if the API key contains characters that aren't
    /// valid in an HTTP header value (e.g. control characters or non-ASCII)
    /// — previously this was an `.unwrap()` that crashed the backend
    /// process when the user pasted a mangled key.
    fn headers(&self, api_key: &str) -> Result<HeaderMap, AiError> {
        let mut headers = HeaderMap::new();
        let (name, prefix) = self.api_key_header();
        let header_name = HeaderName::from_str(name)
            .map_err(|e| AiError::InvalidConfig(format!("invalid header name {name:?}: {e}")))?;
        let header_value = HeaderValue::from_str(&format!("{}{}", prefix, api_key))
            .map_err(|_| AiError::InvalidConfig(
                "API key contains characters that aren't valid in an HTTP header. \
                 Re-copy your key from the provider's dashboard.".to_string(),
            ))?;
        headers.insert(header_name, header_value);
        headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("application/json"),
        );
        Ok(headers)
    }

    /// Serialize the request body in provider-specific format.
    fn build_body(&self, messages: &[ChatMessage], model: &str) -> String;

    /// Parse the response body and extract the assistant's text.
    fn parse_response(&self, body: &str) -> Result<String, AiError>;

    /// Execute the async chat call: POST to endpoint with given body, return response text.
    async fn chat(
        &self,
        client: &reqwest::Client,
        messages: &[ChatMessage],
        model: &str,
        api_key: &str,
    ) -> Result<AiResponse, AiError> {
        let body = self.build_body(messages, model);
        let response = client
            .post(self.endpoint())
            .headers(self.headers(api_key)?)
            .body(body)
            .send()
            .await
            .map_err(AiError::HttpError)?;

        let status_code = response.status();
        let text = response.text().await.map_err(AiError::HttpError)?;

        if !status_code.is_success() {
            let status = status_code.as_u16();
            let message =
                serde_json::from_str::<serde_json::Value>(&text)
                    .ok()
                    .and_then(|v| {
                        v.get("error")
                            .and_then(|e| e.as_str())
                            .map(String::from)
                    })
                    .or_else(|| {
                        serde_json::from_str::<serde_json::Value>(&text)
                            .ok()
                            .and_then(|v| {
                                v.get("message")
                                    .and_then(|m| m.as_str())
                                    .map(String::from)
                            })
                    })
                    .unwrap_or_else(|| text.chars().take(200).collect());

            return Err(AiError::ApiError { status, message });
        }

        let content = self.parse_response(&text)?;
        Ok(AiResponse { content })
    }
}

// ============================================================================
// OpenAI
// ============================================================================

pub struct OpenAiProvider;

impl Provider for OpenAiProvider {
    fn endpoint(&self) -> &str {
        "https://api.openai.com/v1/chat/completions"
    }

    fn build_body(&self, messages: &[ChatMessage], model: &str) -> String {
        let msgs: Vec<_> = messages
            .iter()
            .map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            })
            .collect();
        serde_json::to_string(&serde_json::json!({
            "model": model,
            "messages": msgs,
        }))
        .unwrap()
    }

    fn parse_response(&self, body: &str) -> Result<String, AiError> {
        #[derive(Deserialize)]
        struct OpenAiResponse {
            choices: Vec<Choice>,
        }
        #[derive(Deserialize)]
        struct Choice {
            message: Message,
        }
        #[derive(Deserialize)]
        struct Message {
            content: Option<String>,
        }
        let resp: OpenAiResponse =
            serde_json::from_str(body).map_err(|e| AiError::ParseError(e.to_string()))?;
        resp.choices
            .first()
            .and_then(|c| c.message.content.clone())
            .filter(|s| !s.is_empty())
            .ok_or(AiError::EmptyResponse)
    }
}

// ============================================================================
// Anthropic
// ============================================================================

pub struct AnthropicProvider;

impl Provider for AnthropicProvider {
    fn endpoint(&self) -> &str {
        "https://api.anthropic.com/v1/messages"
    }

    fn api_key_header(&self) -> (&str, &str) {
        ("x-api-key", "")
    }

    fn headers(&self, api_key: &str) -> Result<HeaderMap, AiError> {
        let mut headers = HeaderMap::new();
        let api_key_value = HeaderValue::from_str(api_key).map_err(|_| {
            AiError::InvalidConfig(
                "Anthropic API key contains characters that aren't valid in an HTTP header. \
                 Re-copy your key from console.anthropic.com.".to_string(),
            )
        })?;
        headers.insert(HeaderName::from_static("x-api-key"), api_key_value);
        headers.insert(
            HeaderName::from_static("anthropic-version"),
            HeaderValue::from_static("2023-06-01"),
        );
        headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("application/json"),
        );
        Ok(headers)
    }

    fn build_body(&self, messages: &[ChatMessage], model: &str) -> String {
        // Anthropic's Messages API requires `system` at the top level, not as
        // a role inside `messages`. Concatenate every system message into one
        // string and put the rest in `messages`.
        let mut system_parts: Vec<String> = Vec::new();
        let mut conversation: Vec<serde_json::Value> = Vec::new();
        for m in messages {
            if m.role == "system" {
                system_parts.push(m.content.clone());
            } else {
                conversation.push(serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                }));
            }
        }

        // Anthropic's Messages API requires max_tokens. 4096 fits every
        // current Claude model's output ceiling and is plenty for the
        // study/lookup chats this app issues. Power users with extended
        // workflows can override via LOGOS_AI_MAX_TOKENS — invalid values
        // fall back to the default rather than failing the request.
        let max_tokens: u32 = std::env::var("LOGOS_AI_MAX_TOKENS")
            .ok()
            .and_then(|s| s.parse().ok())
            .filter(|n: &u32| *n > 0)
            .unwrap_or(4096);
        let mut payload = serde_json::json!({
            "model": model,
            "messages": conversation,
            "max_tokens": max_tokens,
        });
        if !system_parts.is_empty() {
            payload["system"] = serde_json::Value::String(system_parts.join("\n\n"));
        }
        serde_json::to_string(&payload).unwrap()
    }

    fn parse_response(&self, body: &str) -> Result<String, AiError> {
        #[derive(Deserialize)]
        struct AnthropicResponse {
            content: Vec<ContentBlock>,
        }
        #[derive(Deserialize)]
        #[serde(tag = "type")]
        enum ContentBlock {
            #[serde(rename = "text")]
            Text { text: String },
        }
        let resp: AnthropicResponse =
            serde_json::from_str(body).map_err(|e| AiError::ParseError(e.to_string()))?;
        resp.content
            .into_iter()
            .map(|ContentBlock::Text { text }| text)
            .find(|s| !s.is_empty())
            .ok_or(AiError::EmptyResponse)
    }
}

// ============================================================================
// Google AI (Gemini)
// ============================================================================

pub struct GoogleProvider;

impl Provider for GoogleProvider {
    fn endpoint(&self) -> &str {
        "https://generativelanguage.googleapis.com/v1beta/models"
    }

    async fn chat(
        &self,
        client: &reqwest::Client,
        messages: &[ChatMessage],
        model: &str,
        api_key: &str,
    ) -> Result<AiResponse, AiError> {
        let body = self.build_body(messages, model);
        // Build the URL without the api_key, then attach it as a query
        // parameter so reqwest URL-encodes it. Concatenating it into the
        // format string (the previous behaviour) corrupted the URL if the
        // key contained any URL-reserved characters.
        let url = format!("{}/{model}:generateContent", self.endpoint());
        let response = client
            .post(&url)
            .query(&[("key", api_key)])
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(AiError::HttpError)?;

        let status_code = response.status();
        let text = response.text().await.map_err(AiError::HttpError)?;

        if !status_code.is_success() {
            let status = status_code.as_u16();
            let message = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| {
                    v.get("error")
                        .and_then(|e| e.get("message"))
                        .and_then(|m| m.as_str())
                        .map(String::from)
                })
                .unwrap_or_else(|| text.chars().take(200).collect());

            return Err(AiError::ApiError { status, message });
        }

        let content = self.parse_response(&text)?;
        Ok(AiResponse { content })
    }

    fn build_body(&self, messages: &[ChatMessage], _model: &str) -> String {
        // Gemini supports a top-level `systemInstruction` separate from the
        // user/model conversation. Pull system messages out and put the rest
        // in `contents` with `assistant` mapped to `model`.
        let mut system_parts: Vec<String> = Vec::new();
        let mut contents: Vec<serde_json::Value> = Vec::new();
        for m in messages {
            if m.role == "system" {
                system_parts.push(m.content.clone());
                continue;
            }
            contents.push(serde_json::json!({
                "role": if m.role == "assistant" { "model" } else { "user" },
                "parts": [{ "text": m.content }],
            }));
        }

        let mut payload = serde_json::json!({ "contents": contents });
        if !system_parts.is_empty() {
            payload["systemInstruction"] = serde_json::json!({
                "parts": [{ "text": system_parts.join("\n\n") }],
            });
        }
        serde_json::to_string(&payload).unwrap()
    }

    fn parse_response(&self, body: &str) -> Result<String, AiError> {
        #[derive(Deserialize)]
        struct GoogleResponse {
            candidates: Vec<Candidate>,
        }
        #[derive(Deserialize)]
        struct Candidate {
            content: Content,
        }
        #[derive(Deserialize)]
        struct Content {
            parts: Vec<Part>,
        }
        #[derive(Deserialize)]
        struct Part {
            text: Option<String>,
        }
        let resp: GoogleResponse =
            serde_json::from_str(body).map_err(|e| AiError::ParseError(e.to_string()))?;
        resp.candidates
            .first()
            .and_then(|c| c.content.parts.iter().find_map(|p| p.text.clone()))
            .filter(|s| !s.is_empty())
            .ok_or(AiError::EmptyResponse)
    }
}

// ============================================================================
// Groq
// ============================================================================

pub struct GroqProvider;

impl Provider for GroqProvider {
    fn endpoint(&self) -> &str {
        "https://api.groq.com/openai/v1/chat/completions"
    }

    fn build_body(&self, messages: &[ChatMessage], model: &str) -> String {
        let msgs: Vec<_> = messages
            .iter()
            .map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            })
            .collect();
        serde_json::to_string(&serde_json::json!({
            "model": model,
            "messages": msgs,
        }))
        .unwrap()
    }

    fn parse_response(&self, body: &str) -> Result<String, AiError> {
        #[derive(Deserialize)]
        struct OpenAiResponse {
            choices: Vec<Choice>,
        }
        #[derive(Deserialize)]
        struct Choice {
            message: Message,
        }
        #[derive(Deserialize)]
        struct Message {
            content: Option<String>,
        }
        let resp: OpenAiResponse =
            serde_json::from_str(body).map_err(|e| AiError::ParseError(e.to_string()))?;
        resp.choices
            .first()
            .and_then(|c| c.message.content.clone())
            .filter(|s| !s.is_empty())
            .ok_or(AiError::EmptyResponse)
    }
}

// ============================================================================
// Ollama (local)
// ============================================================================

pub struct OllamaProvider;

impl Provider for OllamaProvider {
    fn endpoint(&self) -> &str {
        "http://localhost:11434/api/chat"
    }

    fn api_key_header(&self) -> (&str, &str) {
        ("", "")
    }

    fn headers(&self, _api_key: &str) -> Result<HeaderMap, AiError> {
        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("content-type"),
            HeaderValue::from_static("application/json"),
        );
        Ok(headers)
    }

    fn build_body(&self, messages: &[ChatMessage], model: &str) -> String {
        let msgs: Vec<_> = messages
            .iter()
            .map(|m| {
                serde_json::json!({
                    "role": m.role,
                    "content": m.content,
                })
            })
            .collect();
        serde_json::to_string(&serde_json::json!({
            "model": model,
            "messages": msgs,
            "stream": false,
        }))
        .unwrap()
    }

    fn parse_response(&self, body: &str) -> Result<String, AiError> {
        #[derive(Deserialize)]
        struct OllamaResponse {
            message: OllamaMessage,
        }
        #[derive(Deserialize)]
        struct OllamaMessage {
            content: String,
        }
        let resp: OllamaResponse =
            serde_json::from_str(body).map_err(|e| AiError::ParseError(e.to_string()))?;
        if resp.message.content.is_empty() {
            Err(AiError::EmptyResponse)
        } else {
            Ok(resp.message.content)
        }
    }
}

// ============================================================================
// Dispatcher
// ============================================================================

/// Build a `reqwest::Client` configured for AI provider calls. Held in
/// `AppState` and reused across requests so we keep the connection pool
/// (and TLS session resumption) warm across consecutive AI prompts.
pub fn build_http_client() -> Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
}

/// Calls the appropriate provider based on the `provider` string (async).
pub async fn chat_with_provider(
    client: &reqwest::Client,
    provider: &str,
    messages: Vec<ChatMessage>,
    model: &str,
    api_key: &str,
) -> Result<AiResponse, AiError> {

    match provider {
        "google" => GoogleProvider.chat(client, &messages, model, api_key).await,
        "openai" => OpenAiProvider.chat(client, &messages, model, api_key).await,
        "anthropic" => AnthropicProvider.chat(client, &messages, model, api_key).await,
        "groq" => GroqProvider.chat(client, &messages, model, api_key).await,
        "ollama" => OllamaProvider.chat(client, &messages, model, api_key).await,
        _ => Err(AiError::UnsupportedProvider(provider.to_string())),
    }
}
