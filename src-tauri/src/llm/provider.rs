use crate::config::registry::{
    DEFAULT_LLM_BASE_URL, DEFAULT_LLM_MODEL, DEFAULT_LLM_PROVIDER, KEY_LLM_API_KEY,
    KEY_LLM_BASE_URL, KEY_LLM_MAX_CONTEXT_ITEMS, KEY_LLM_MODEL, KEY_LLM_PROVIDER,
};
use crate::{database, AppError, Database};
use async_trait::async_trait;
use futures_util::stream::{self, BoxStream, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn complete(&self, prompt: &str) -> Result<String, AppError>;
    /// Stream the completion as plain-text deltas. The default implementation
    /// delegates to [`complete`] and yields the whole answer as one chunk.
    /// Providers that support server-sent streaming override this so the HTTP
    /// QA endpoint can relay tokens as they arrive.
    fn complete_stream<'a>(&'a self, prompt: &'a str) -> BoxStream<'a, Result<String, AppError>> {
        Box::pin(stream::once(async move { self.complete(prompt).await }))
    }
    fn name(&self) -> &'static str;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmConfig {
    pub provider: String,
    pub api_key: Option<String>,
    pub model: String,
    pub base_url: String,
    pub max_context_items: usize,
}

impl LlmConfig {
    pub fn load(db: &Database) -> Result<Self, AppError> {
        let get = |key: &str| database::config::get(db, key);
        let provider = get(KEY_LLM_PROVIDER)?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_LLM_PROVIDER.to_string());
        let api_key = get(KEY_LLM_API_KEY)?.filter(|value| !value.trim().is_empty());
        let model = get(KEY_LLM_MODEL)?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_LLM_MODEL.to_string());
        let base_url = get(KEY_LLM_BASE_URL)?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_LLM_BASE_URL.to_string());
        let max_context_items = get(KEY_LLM_MAX_CONTEXT_ITEMS)?
            .and_then(|value| value.parse::<usize>().ok())
            .unwrap_or(8)
            .clamp(1, 50);

        Ok(Self {
            provider,
            api_key,
            model,
            base_url,
            max_context_items,
        })
    }

    #[cfg(test)]
    pub fn fake_for_tests() -> Self {
        Self {
            provider: "fake".to_string(),
            api_key: None,
            model: "fake-test".to_string(),
            base_url: "https://example.invalid/v1".to_string(),
            max_context_items: 8,
        }
    }
}

pub fn create_provider_from_config(config: &LlmConfig) -> Box<dyn LlmProvider> {
    match config.provider.trim().to_ascii_lowercase().as_str() {
        "openai" => Box::new(OpenAiProvider::new(config.clone())),
        _ => Box::new(FakeProvider::new(config.clone())),
    }
}

#[derive(Debug)]
pub struct FakeProvider {
    config: LlmConfig,
    fixed_response: Option<String>,
    last_prompt: Mutex<Option<String>>,
}

impl FakeProvider {
    pub fn new(config: LlmConfig) -> Self {
        Self {
            config,
            fixed_response: None,
            last_prompt: Mutex::new(None),
        }
    }

    #[cfg(test)]
    pub fn with_response(config: LlmConfig, response: impl Into<String>) -> Self {
        Self {
            config,
            fixed_response: Some(response.into()),
            last_prompt: Mutex::new(None),
        }
    }

    pub fn last_prompt(&self) -> Option<String> {
        self.last_prompt.lock().ok().and_then(|value| value.clone())
    }
}

#[async_trait]
impl LlmProvider for FakeProvider {
    async fn complete(&self, prompt: &str) -> Result<String, AppError> {
        if let Ok(mut last_prompt) = self.last_prompt.lock() {
            *last_prompt = Some(prompt.to_string());
        }
        if let Some(response) = &self.fixed_response {
            return Ok(response.clone());
        }
        let context_count = prompt.matches("[Clipboard item ").count();
        Ok(format!(
            "[FakeProvider model={}] received {} chars with {} context item(s).",
            self.config.model,
            prompt.len(),
            context_count
        ))
    }

    fn name(&self) -> &'static str {
        "fake"
    }
}

#[derive(Debug, Clone)]
pub struct OpenAiProvider {
    config: LlmConfig,
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(config: LlmConfig) -> Self {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|error| {
                tracing::warn!("failed to build timeout-configured LLM client: {}", error);
                reqwest::Client::new()
            });
        Self { config, client }
    }

    fn endpoint_url(&self) -> String {
        format!(
            "{}/chat/completions",
            self.config.base_url.trim_end_matches('/')
        )
    }
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: [ChatMessage<'a>; 1],
    temperature: f32,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    stream: bool,
}

#[derive(Deserialize, Default)]
struct ChatStreamChunk {
    choices: Vec<ChatStreamChoice>,
}

#[derive(Deserialize, Default)]
struct ChatStreamChoice {
    delta: ChatStreamDelta,
}

#[derive(Deserialize, Default)]
struct ChatStreamDelta {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'static str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

#[async_trait]
impl LlmProvider for OpenAiProvider {
    async fn complete(&self, prompt: &str) -> Result<String, AppError> {
        let (api_key, body) = self.prepare_request(prompt, false)?;
        let response = self
            .client
            .post(self.endpoint_url())
            .bearer_auth(api_key)
            .json(&body)
            .send()
            .await
            .map_err(|error| AppError::Llm(format!("LLM request failed: {error}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AppError::Llm(format!("LLM returned HTTP {status}: {body}")));
        }

        let parsed = response
            .json::<ChatResponse>()
            .await
            .map_err(|error| AppError::Llm(format!("failed to parse LLM response: {error}")))?;

        parsed
            .choices
            .into_iter()
            .next()
            .map(|choice| choice.message.content)
            .ok_or_else(|| AppError::Llm("LLM returned no choices".to_string()))
    }

    fn complete_stream<'a>(&'a self, prompt: &'a str) -> BoxStream<'a, Result<String, AppError>> {
        Box::pin(async_stream::stream! {
            let prepared = self.prepare_request(prompt, true);
            let (api_key, body) = match prepared {
                Ok(parts) => parts,
                Err(error) => {
                    yield Err(error);
                    return;
                }
            };
            let response = match self
                .client
                .post(self.endpoint_url())
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await
            {
                Ok(response) => response,
                Err(error) => {
                    yield Err(AppError::Llm(format!("LLM request failed: {error}")));
                    return;
                }
            };
            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                yield Err(AppError::Llm(format!("LLM returned HTTP {status}: {body}")));
                return;
            }

            let mut byte_stream = response.bytes_stream();
            let mut buffer = String::new();
            let mut saw_done = false;
            while let Some(chunk) = byte_stream.next().await {
                let bytes = match chunk {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        yield Err(AppError::Llm(format!("LLM stream failed: {error}")));
                        return;
                    }
                };
                buffer.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(newline) = buffer.find('\n') {
                    let line = buffer[..newline].trim().to_string();
                    buffer.drain(..=newline);
                    let Some(data) = line.strip_prefix("data:") else {
                        continue;
                    };
                    let data = data.trim();
                    if data.is_empty() {
                        continue;
                    }
                    if data == "[DONE]" {
                        saw_done = true;
                        break;
                    }
                    match serde_json::from_str::<ChatStreamChunk>(data) {
                        Ok(parsed) => {
                            for choice in parsed.choices {
                                if let Some(text) = choice.delta.content {
                                    if !text.is_empty() {
                                        yield Ok(text);
                                    }
                                }
                            }
                        }
                        Err(error) => {
                            yield Err(AppError::Llm(format!(
                                "failed to parse LLM stream chunk: {error}"
                            )));
                            return;
                        }
                    }
                }
                if saw_done {
                    break;
                }
            }
        })
    }

    fn name(&self) -> &'static str {
        "openai"
    }
}

impl OpenAiProvider {
    fn prepare_request<'a>(
        &'a self,
        prompt: &'a str,
        stream: bool,
    ) -> Result<(String, ChatRequest<'a>), AppError> {
        let api_key = self
            .config
            .api_key
            .as_deref()
            .ok_or_else(|| AppError::Llm("llm_api_key is not configured".to_string()))?;
        Ok((
            api_key.to_string(),
            ChatRequest {
                model: &self.config.model,
                messages: [ChatMessage {
                    role: "user",
                    content: prompt,
                }],
                temperature: 0.2,
                stream,
            },
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{extract::State, http::HeaderMap, routing::post, Json, Router};
    use serde_json::Value;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn fake_provider_records_prompt_without_network() {
        let provider = FakeProvider::new(LlmConfig {
            provider: "fake".to_string(),
            api_key: None,
            model: "fake-test".to_string(),
            base_url: "https://example.invalid/v1".to_string(),
            max_context_items: 8,
        });

        let answer = provider.complete("context: deploy token").await.unwrap();

        assert!(answer.contains("FakeProvider"));
        assert_eq!(
            provider.last_prompt().as_deref(),
            Some("context: deploy token")
        );
    }

    #[tokio::test]
    async fn openai_provider_posts_chat_completion_with_bearer_auth() {
        #[derive(Clone, Default)]
        struct Captured {
            auth: Arc<Mutex<Option<String>>>,
            model: Arc<Mutex<Option<String>>>,
            prompt: Arc<Mutex<Option<String>>>,
        }

        async fn handler(
            State(captured): State<Captured>,
            headers: HeaderMap,
            Json(body): Json<Value>,
        ) -> Json<Value> {
            *captured.auth.lock().unwrap() = headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                .map(|value| value.to_string());
            *captured.model.lock().unwrap() = body
                .get("model")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            *captured.prompt.lock().unwrap() = body
                .pointer("/messages/0/content")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());

            Json(serde_json::json!({
                "choices": [
                    { "message": { "content": "remote answer" } }
                ]
            }))
        }

        let captured = Captured::default();
        let app = Router::new()
            .route("/chat/completions", post(handler))
            .with_state(captured.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });

        let provider = OpenAiProvider::new(LlmConfig {
            provider: "openai".to_string(),
            api_key: Some("sk-test".to_string()),
            model: "model-x".to_string(),
            base_url: format!("http://{addr}"),
            max_context_items: 8,
        });

        let answer = provider.complete("hello remote").await.unwrap();

        assert_eq!(answer, "remote answer");
        assert_eq!(
            captured.auth.lock().unwrap().as_deref(),
            Some("Bearer sk-test")
        );
        assert_eq!(captured.model.lock().unwrap().as_deref(), Some("model-x"));
        assert_eq!(
            captured.prompt.lock().unwrap().as_deref(),
            Some("hello remote")
        );
    }

    #[tokio::test]
    async fn openai_provider_requires_api_key() {
        let provider = OpenAiProvider::new(LlmConfig {
            provider: "openai".to_string(),
            api_key: None,
            model: "model-x".to_string(),
            base_url: "https://example.invalid/v1".to_string(),
            max_context_items: 8,
        });

        let error = provider.complete("hello").await.unwrap_err();

        assert!(error.to_string().contains("llm_api_key"));
    }
}
