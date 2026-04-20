use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ProviderKind {
    #[serde(rename = "openrouter", alias = "open-router")]
    OpenRouter,
    #[serde(rename = "deepseek", alias = "deep-seek")]
    DeepSeek,
    #[serde(rename = "openai-compatible", alias = "open-ai-compatible")]
    OpenAiCompatible,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderConfig {
    pub id: String,
    pub label: String,
    pub kind: ProviderKind,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_configured: bool,
    pub default_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationProviders {
    pub active_provider_id: String,
    pub providers: Vec<ProviderConfig>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatCompletionChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionChoice {
    message: ChatCompletionMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionMessage {
    content: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct ModelListResponse {
    data: Vec<ModelRecord>,
}

#[derive(Debug, Deserialize)]
struct ModelRecord {
    id: String,
}

impl ProviderConfig {
    pub fn default_openrouter(api_key: Option<String>) -> Self {
        let mut provider = Self {
            id: "openrouter".to_string(),
            label: "OpenRouter".to_string(),
            kind: ProviderKind::OpenRouter,
            base_url: None,
            api_key,
            api_key_configured: false,
            default_model: Some("openai/gpt-4o-mini".to_string()),
        };
        provider.normalize();
        provider
    }

    pub fn default_deepseek() -> Self {
        let mut provider = Self {
            id: "deepseek".to_string(),
            label: "DeepSeek".to_string(),
            kind: ProviderKind::DeepSeek,
            base_url: Some("https://api.deepseek.com".to_string()),
            api_key: None,
            api_key_configured: false,
            default_model: Some("deepseek-chat".to_string()),
        };
        provider.normalize();
        provider
    }

    pub fn default_openai_compatible() -> Self {
        Self {
            id: "openai-compatible".to_string(),
            label: "OpenAI-Compatible".to_string(),
            kind: ProviderKind::OpenAiCompatible,
            base_url: None,
            api_key: None,
            api_key_configured: false,
            default_model: Some("gpt-4o-mini".to_string()),
        }
    }

    pub fn models_url(&self) -> Result<String, String> {
        match self.kind {
            ProviderKind::OpenRouter => Ok("https://openrouter.ai/api/v1/models".to_string()),
            ProviderKind::DeepSeek | ProviderKind::OpenAiCompatible => {
                Ok(format!("{}/models", self.resolved_base_url()?))
            }
        }
    }

    pub fn chat_completions_url(&self) -> Result<String, String> {
        match self.kind {
            ProviderKind::OpenRouter => {
                Ok("https://openrouter.ai/api/v1/chat/completions".to_string())
            }
            ProviderKind::DeepSeek | ProviderKind::OpenAiCompatible => {
                Ok(format!("{}/chat/completions", self.resolved_base_url()?))
            }
        }
    }

    pub fn sanitized(&self) -> Self {
        let mut provider = self.clone();
        provider.api_key_configured = self.authorization_token().is_some();
        provider.api_key = None;
        provider
    }

    pub fn authorization_token(&self) -> Option<&str> {
        self.api_key
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
    }

    pub fn normalize(&mut self) {
        self.base_url = self
            .base_url
            .take()
            .and_then(|value| normalize_optional_string(&value))
            .map(|value| value.trim_end_matches('/').to_string());
        if matches!(self.kind, ProviderKind::DeepSeek) && self.base_url.is_none() {
            self.base_url = Some("https://api.deepseek.com".to_string());
        }
        self.api_key = self
            .api_key
            .take()
            .and_then(|value| normalize_optional_string(&value));
        self.default_model = self
            .default_model
            .take()
            .and_then(|value| normalize_optional_string(&value));
        self.api_key_configured = self.authorization_token().is_some();
    }

    pub fn normalized(mut self) -> Self {
        self.normalize();
        self
    }

    fn required_base_url(&self) -> Result<String, String> {
        self.base_url
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.trim_end_matches('/').to_string())
            .ok_or_else(|| format!("{} base URL is missing.", self.label))
    }

    fn resolved_base_url(&self) -> Result<String, String> {
        match self.kind {
            ProviderKind::DeepSeek => Ok(self
                .base_url
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("https://api.deepseek.com")
                .trim_end_matches('/')
                .to_string()),
            ProviderKind::OpenAiCompatible => self.required_base_url(),
            ProviderKind::OpenRouter => Err("OpenRouter does not use a base URL.".to_string()),
        }
    }

    fn validate_for_request(&self) -> Result<(), String> {
        match self.kind {
            ProviderKind::OpenRouter => {
                if self.authorization_token().is_none() {
                    return Err("OpenRouter API key is missing.".to_string());
                }
                Ok(())
            }
            ProviderKind::DeepSeek => {
                if self.authorization_token().is_none() {
                    return Err("DeepSeek API key is missing.".to_string());
                }
                self.resolved_base_url()?;
                Ok(())
            }
            ProviderKind::OpenAiCompatible => {
                if self.authorization_token().is_none() {
                    return Err(format!("{} API key is missing.", self.label));
                }
                self.required_base_url()?;
                Ok(())
            }
        }
    }

    #[cfg(test)]
    pub fn openrouter_for_test(api_key: &str) -> Self {
        Self::default_openrouter(Some(api_key.to_string()))
    }
}

impl TranslationProviders {
    pub fn default_with_openrouter_key(openrouter_key: Option<String>) -> Self {
        Self {
            active_provider_id: "openrouter".to_string(),
            providers: vec![
                ProviderConfig::default_openrouter(openrouter_key),
                ProviderConfig::default_deepseek(),
                ProviderConfig::default_openai_compatible(),
            ],
        }
    }

    pub fn active_provider(&self) -> Result<ProviderConfig, String> {
        self.provider(&self.active_provider_id)
    }

    pub fn provider(&self, provider_id: &str) -> Result<ProviderConfig, String> {
        self.providers
            .iter()
            .find(|provider| provider.id == provider_id)
            .cloned()
            .ok_or_else(|| format!("Unknown provider: {}", provider_id))
    }

    pub fn sanitized(&self) -> Self {
        Self {
            active_provider_id: self.active_provider_id.clone(),
            providers: self
                .providers
                .iter()
                .map(ProviderConfig::sanitized)
                .collect(),
        }
    }
}

fn normalize_optional_string(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_message_content(content: &serde_json::Value) -> Result<String, String> {
    match content {
        serde_json::Value::String(value) => Ok(value.clone()),
        serde_json::Value::Array(items) => {
            let text = items
                .iter()
                .filter_map(|item| item.get("text").and_then(serde_json::Value::as_str))
                .collect::<Vec<_>>()
                .join("\n");

            if text.trim().is_empty() {
                Err("Provider returned a response without text content.".to_string())
            } else {
                Ok(text)
            }
        }
        _ => Err("Provider returned an unsupported response format.".to_string()),
    }
}

pub async fn request_chat_completion(
    provider: &ProviderConfig,
    model: &str,
    temperature: f32,
    system_prompt: &str,
    user_prompt: &str,
) -> Result<String, String> {
    provider.validate_for_request()?;

    let client = reqwest::Client::new();
    let mut request = client
        .post(provider.chat_completions_url()?)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "model": model,
            "temperature": temperature,
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ]
        }));

    if let Some(token) = provider.authorization_token() {
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let response = request.send().await.map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("{} error: {} {}", provider.label, status, text));
    }

    let parsed: ChatCompletionResponse =
        response.json().await.map_err(|error| error.to_string())?;
    let message = parsed
        .choices
        .first()
        .ok_or_else(|| format!("{} returned no choices.", provider.label))?;

    extract_message_content(&message.message.content)
}

pub async fn list_models(provider: &ProviderConfig) -> Result<Vec<String>, String> {
    provider.validate_for_request()?;

    let client = reqwest::Client::new();
    let mut request = client.get(provider.models_url()?);

    if let Some(token) = provider.authorization_token() {
        request = request.header("Authorization", format!("Bearer {}", token));
    }

    let response = request.send().await.map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("{} error: {} {}", provider.label, status, text));
    }

    let parsed: ModelListResponse = response.json().await.map_err(|error| error.to_string())?;
    let mut models = Vec::new();

    for record in parsed.data {
        if !record.id.trim().is_empty() && !models.contains(&record.id) {
            models.push(record.id);
        }
    }

    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::{ProviderConfig, ProviderKind};
    use serde_json::{from_str, to_string};

    #[test]
    fn openrouter_uses_fixed_models_endpoint() {
        let provider = ProviderConfig::openrouter_for_test("key");
        assert_eq!(
            provider.models_url().unwrap(),
            "https://openrouter.ai/api/v1/models"
        );
    }

    #[test]
    fn openai_compatible_requires_an_api_key_for_requests() {
        let provider = ProviderConfig {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            kind: ProviderKind::OpenAiCompatible,
            base_url: Some("https://api.example.com/v1".to_string()),
            api_key: None,
            api_key_configured: false,
            default_model: Some("model".to_string()),
        }
        .normalized();

        assert_eq!(
            provider.validate_for_request().unwrap_err(),
            "Custom API key is missing."
        );
    }

    #[test]
    fn provider_kind_accepts_legacy_values_and_serializes_canonical_frontend_values() {
        assert_eq!(from_str::<ProviderKind>("\"open-router\"").unwrap(), ProviderKind::OpenRouter);
        assert_eq!(from_str::<ProviderKind>("\"deep-seek\"").unwrap(), ProviderKind::DeepSeek);
        assert_eq!(
            from_str::<ProviderKind>("\"open-ai-compatible\"").unwrap(),
            ProviderKind::OpenAiCompatible
        );

        assert_eq!(to_string(&ProviderKind::OpenRouter).unwrap(), "\"openrouter\"");
        assert_eq!(to_string(&ProviderKind::DeepSeek).unwrap(), "\"deepseek\"");
        assert_eq!(
            to_string(&ProviderKind::OpenAiCompatible).unwrap(),
            "\"openai-compatible\""
        );
    }
}
