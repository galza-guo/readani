use crate::providers::{ProviderConfig, ProviderKind, TranslationProviders};
use serde::{Deserialize, Serialize};

const DEFAULT_MODEL: &str = "openrouter/free";
const DEFAULT_LANGUAGE_CODE: &str = "zh-CN";
const DEFAULT_LANGUAGE_LABEL: &str = "Chinese (Simplified)";
const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com";
const OLLAMA_BASE_URL: &str = "http://localhost:11434/v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum AppTheme {
    System,
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SettingsLanguage {
    pub code: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationPreset {
    pub id: String,
    pub label: String,
    pub provider_kind: ProviderKind,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_configured: bool,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: AppTheme,
    pub default_language: SettingsLanguage,
    pub active_preset_id: String,
    #[serde(default)]
    pub auto_fallback_enabled: bool,
    #[serde(default)]
    pub translate_all_slow_mode: bool,
    pub presets: Vec<TranslationPreset>,
}

impl Default for AppTheme {
    fn default() -> Self {
        Self::System
    }
}

impl Default for SettingsLanguage {
    fn default() -> Self {
        Self {
            code: DEFAULT_LANGUAGE_CODE.to_string(),
            label: DEFAULT_LANGUAGE_LABEL.to_string(),
        }
    }
}

impl TranslationPreset {
    pub fn normalized(&self) -> Self {
        let provider_kind = self.provider_kind.clone();
        let model = normalize_required_string(Some(&self.model)).unwrap_or_default();
        let base_url = normalize_base_url(self.base_url.as_deref(), &provider_kind);
        let api_key = if provider_kind.uses_api_key() {
            normalize_optional_string(self.api_key.as_deref())
        } else {
            None
        };
        let label = build_preset_label(&provider_kind, &model);
        let id = normalize_required_string(Some(&self.id))
            .unwrap_or_else(|| slugify(&build_preset_id_seed(&provider_kind, &model)));

        Self {
            id,
            label,
            provider_kind,
            base_url,
            api_key_configured: api_key.is_some(),
            api_key,
            model,
        }
    }

    pub fn to_provider_config(&self) -> ProviderConfig {
        let mut provider = ProviderConfig {
            id: self.id.clone(),
            label: self.label.clone(),
            kind: self.provider_kind.clone(),
            base_url: self.base_url.clone(),
            api_key: self.api_key.clone(),
            api_key_configured: self.api_key_configured,
            default_model: Some(self.model.clone()),
        };
        provider.normalize();
        provider
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: AppTheme::System,
            default_language: SettingsLanguage::default(),
            active_preset_id: String::new(),
            auto_fallback_enabled: false,
            translate_all_slow_mode: false,
            presets: vec![],
        }
    }
}

impl AppSettings {
    pub fn normalized(&self) -> Self {
        let mut normalized = self.clone();
        normalized.default_language = normalize_language(Some(&self.default_language));
        normalized.presets = normalize_presets(&self.presets);
        normalized
            .presets
            .retain(|preset| !is_seeded_legacy_placeholder_preset(preset));

        normalized.active_preset_id = if normalized.presets.is_empty() {
            String::new()
        } else if normalized
            .presets
            .iter()
            .any(|preset| preset.id == self.active_preset_id)
        {
            self.active_preset_id.trim().to_string()
        } else {
            normalized.presets[0].id.clone()
        };

        normalized
    }

    pub fn sanitized(&self) -> Self {
        let mut settings = self.clone();
        settings.presets = settings
            .presets
            .into_iter()
            .map(|mut preset| {
                preset.api_key_configured = preset
                    .api_key
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_some();
                preset.api_key = None;
                preset
            })
            .collect();
        settings
    }

    pub fn preset(&self, preset_id: &str) -> Result<TranslationPreset, String> {
        self.presets
            .iter()
            .find(|preset| preset.id == preset_id)
            .cloned()
            .ok_or_else(|| format!("Unknown preset: {}", preset_id))
    }

    pub fn active_preset(&self) -> Result<TranslationPreset, String> {
        if self.presets.is_empty() {
            return Err("No preset configured.".to_string());
        }
        self.preset(&self.active_preset_id)
    }
}

pub fn merge_app_settings(existing: AppSettings, incoming: AppSettings) -> AppSettings {
    let existing = existing.normalized();
    let mut merged = incoming.clone();
    merged.presets = incoming
        .presets
        .into_iter()
        .map(|preset| {
            let mut preset = preset;
            if let Some(saved) = existing
                .presets
                .iter()
                .find(|candidate| candidate.id == preset.id)
            {
                if !preset.provider_kind.uses_api_key() {
                    preset.api_key = None;
                    return preset;
                }
                if preset
                    .api_key
                    .as_deref()
                    .map(str::trim)
                    .unwrap_or("")
                    .is_empty()
                {
                    preset.api_key = saved.api_key.clone();
                }
            }
            preset
        })
        .collect();

    merged.normalized()
}

pub fn migrate_legacy_translation_providers(
    legacy: TranslationProviders,
    theme: Option<AppTheme>,
    default_language: Option<SettingsLanguage>,
) -> AppSettings {
    let mut presets = Vec::new();

    for provider in legacy.providers {
        let normalized_provider = provider.normalized();
        let provider_kind = normalized_provider.kind.clone();
        let model = normalized_provider
            .default_model
            .clone()
            .unwrap_or_else(|| default_model_for_provider_kind(&provider_kind).to_string());
        let mut preset = TranslationPreset {
            id: slugify(&build_preset_id_seed(&provider_kind, &model)),
            label: String::new(),
            provider_kind,
            base_url: normalized_provider.base_url.clone(),
            api_key: normalized_provider.api_key.clone(),
            api_key_configured: normalized_provider.api_key_configured,
            model,
        }
        .normalized();

        preset.id = dedupe_id(
            &preset.id,
            &presets
                .iter()
                .map(|item: &TranslationPreset| item.id.clone())
                .collect::<Vec<_>>(),
        );
        preset.label = dedupe_label(
            &preset.label,
            &presets
                .iter()
                .map(|item: &TranslationPreset| item.label.clone())
                .collect::<Vec<_>>(),
        );
        presets.push(preset);
    }

    let active_preset_id = presets
        .iter()
        .find(|preset| matches_legacy_active_provider(preset, &legacy.active_provider_id))
        .map(|preset| preset.id.clone())
        .or_else(|| presets.first().map(|preset| preset.id.clone()))
        .unwrap_or_default();

    AppSettings {
        theme: theme.unwrap_or_default(),
        default_language: normalize_language(default_language.as_ref()),
        active_preset_id,
        auto_fallback_enabled: false,
        translate_all_slow_mode: false,
        presets,
    }
    .normalized()
}

pub fn build_preset_label(provider_kind: &ProviderKind, model: &str) -> String {
    let provider_label = match provider_kind {
        ProviderKind::OpenRouter => "OpenRouter",
        ProviderKind::DeepSeek => "DeepSeek",
        ProviderKind::Ollama => "Ollama",
        ProviderKind::OpenAiCompatible => "Custom",
    };
    let trimmed_model = model.trim();

    if trimmed_model.is_empty() {
        provider_label.to_string()
    } else {
        format!("{} · {}", provider_label, trimmed_model)
    }
}

fn normalize_presets(presets: &[TranslationPreset]) -> Vec<TranslationPreset> {
    let mut normalized = Vec::new();

    for preset in presets {
        let mut next = preset.normalized();
        next.label = dedupe_label(
            &next.label,
            &normalized
                .iter()
                .map(|item: &TranslationPreset| item.label.clone())
                .collect::<Vec<_>>(),
        );
        next.id = dedupe_id(
            &next.id,
            &normalized
                .iter()
                .map(|item: &TranslationPreset| item.id.clone())
                .collect::<Vec<_>>(),
        );
        normalized.push(next);
    }

    normalized
}

fn normalize_language(language: Option<&SettingsLanguage>) -> SettingsLanguage {
    let code = normalize_required_string(language.map(|value| value.code.as_str()))
        .unwrap_or_else(|| DEFAULT_LANGUAGE_CODE.to_string());
    let label = normalize_required_string(language.map(|value| value.label.as_str()))
        .unwrap_or_else(|| default_language_label(&code).to_string());

    SettingsLanguage { code, label }
}

fn default_language_label(code: &str) -> &str {
    match code {
        "zh-CN" => "Chinese (Simplified)",
        "zh-TW" => "Chinese (Traditional)",
        "ja" => "Japanese",
        "ko" => "Korean",
        "es" => "Spanish",
        "fr" => "French",
        "de" => "German",
        "it" => "Italian",
        _ => code,
    }
}

fn normalize_base_url(base_url: Option<&str>, provider_kind: &ProviderKind) -> Option<String> {
    match provider_kind {
        ProviderKind::DeepSeek => {
            normalize_optional_string(base_url).or_else(|| Some(DEEPSEEK_BASE_URL.to_string()))
        }
        ProviderKind::Ollama => {
            normalize_optional_string(base_url).or_else(|| Some(OLLAMA_BASE_URL.to_string()))
        }
        _ => normalize_optional_string(base_url),
    }
    .map(|value| value.trim_end_matches('/').to_string())
}

fn normalize_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn normalize_required_string(value: Option<&str>) -> Option<String> {
    normalize_optional_string(value)
}

fn build_preset_id_seed(provider_kind: &ProviderKind, model: &str) -> String {
    let provider_seed = match provider_kind {
        ProviderKind::OpenRouter => "openrouter",
        ProviderKind::DeepSeek => "deepseek",
        ProviderKind::Ollama => "ollama",
        ProviderKind::OpenAiCompatible => "openai-compatible",
    };

    match normalize_required_string(Some(model)) {
        Some(model_seed) => format!("{}-{}", provider_seed, model_seed),
        None => provider_seed.to_string(),
    }
}

fn slugify(value: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;

    for ch in value.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            output.push(lower);
            previous_dash = false;
        } else if !previous_dash {
            output.push('-');
            previous_dash = true;
        }
    }

    output.trim_matches('-').to_string()
}

fn dedupe_label(label: &str, existing_labels: &[String]) -> String {
    if !existing_labels.iter().any(|existing| existing == label) {
        return label.to_string();
    }

    let mut suffix = 2;
    let mut candidate = format!("{} ({})", label, suffix);
    while existing_labels
        .iter()
        .any(|existing| existing == &candidate)
    {
        suffix += 1;
        candidate = format!("{} ({})", label, suffix);
    }
    candidate
}

fn dedupe_id(id: &str, existing_ids: &[String]) -> String {
    if !existing_ids.iter().any(|existing| existing == id) {
        return id.to_string();
    }

    let mut suffix = 2;
    let mut candidate = format!("{}-{}", id, suffix);
    while existing_ids.iter().any(|existing| existing == &candidate) {
        suffix += 1;
        candidate = format!("{}-{}", id, suffix);
    }
    candidate
}

fn matches_legacy_active_provider(
    preset: &TranslationPreset,
    legacy_active_provider_id: &str,
) -> bool {
    match preset.provider_kind {
        ProviderKind::OpenRouter => legacy_active_provider_id == "openrouter",
        ProviderKind::DeepSeek => legacy_active_provider_id == "deepseek",
        ProviderKind::Ollama => legacy_active_provider_id == "ollama",
        ProviderKind::OpenAiCompatible => legacy_active_provider_id == "openai-compatible",
    }
}

fn default_model_for_provider_kind(provider_kind: &ProviderKind) -> &'static str {
    match provider_kind {
        ProviderKind::OpenRouter => DEFAULT_MODEL,
        ProviderKind::DeepSeek => "deepseek-chat",
        ProviderKind::Ollama => "llama3.2",
        ProviderKind::OpenAiCompatible => "gpt-4o-mini",
    }
}

fn is_seeded_legacy_placeholder_preset(preset: &TranslationPreset) -> bool {
    let expected_model = default_model_for_provider_kind(&preset.provider_kind);
    let expected_id = slugify(&build_preset_id_seed(&preset.provider_kind, expected_model));
    let expected_base_url = match preset.provider_kind {
        ProviderKind::DeepSeek => Some(DEEPSEEK_BASE_URL.to_string()),
        ProviderKind::Ollama => Some(OLLAMA_BASE_URL.to_string()),
        ProviderKind::OpenRouter | ProviderKind::OpenAiCompatible => None,
    };

    preset.id == expected_id
        && preset.model.trim() == expected_model
        && normalize_base_url(preset.base_url.as_deref(), &preset.provider_kind)
            == expected_base_url
        && normalize_optional_string(preset.api_key.as_deref()).is_none()
}

#[cfg(test)]
mod tests {
    use super::{
        migrate_legacy_translation_providers, AppSettings, AppTheme, SettingsLanguage,
        TranslationPreset,
    };
    use crate::providers::{ProviderConfig, ProviderKind, TranslationProviders};

    #[test]
    fn defaults_to_system_theme_and_simplified_chinese() {
        let settings = AppSettings::default();

        assert_eq!(settings.theme, AppTheme::System);
        assert_eq!(
            settings.default_language,
            SettingsLanguage {
                code: "zh-CN".to_string(),
                label: "Chinese (Simplified)".to_string(),
            }
        );
        assert_eq!(settings.active_preset_id, "");
        assert!(!settings.translate_all_slow_mode);
        assert!(settings.presets.is_empty());
    }

    #[test]
    fn migrates_legacy_provider_configs_into_presets() {
        let legacy = TranslationProviders {
            active_provider_id: "openai-compatible".to_string(),
            providers: vec![
                ProviderConfig {
                    id: "openrouter".to_string(),
                    label: "OpenRouter".to_string(),
                    kind: ProviderKind::OpenRouter,
                    base_url: None,
                    api_key: Some("sk-or-test".to_string()),
                    api_key_configured: true,
                    default_model: Some("openrouter/free".to_string()),
                },
                ProviderConfig {
                    id: "openai-compatible".to_string(),
                    label: "OpenAI-Compatible".to_string(),
                    kind: ProviderKind::OpenAiCompatible,
                    base_url: Some("https://api.example.com/v1".to_string()),
                    api_key: Some("sk-custom".to_string()),
                    api_key_configured: true,
                    default_model: Some("gpt-4o-mini".to_string()),
                },
            ],
        };

        let settings = migrate_legacy_translation_providers(
            legacy,
            Some(AppTheme::Dark),
            Some(SettingsLanguage {
                code: "ja".to_string(),
                label: "Japanese".to_string(),
            }),
        );

        assert_eq!(settings.theme, AppTheme::Dark);
        assert_eq!(settings.default_language.code, "ja");
        assert_eq!(settings.presets.len(), 2);
        assert_eq!(settings.active_preset_id, "openai-compatible-gpt-4o-mini");
        assert_eq!(
            settings
                .presets
                .iter()
                .find(|preset| preset.id == settings.active_preset_id)
                .map(|preset| preset.base_url.as_deref()),
            Some(Some("https://api.example.com/v1"))
        );
    }

    #[test]
    fn normalization_preserves_saved_api_keys_and_marks_them_configured() {
        let settings = AppSettings {
            theme: AppTheme::System,
            default_language: SettingsLanguage {
                code: "".to_string(),
                label: "".to_string(),
            },
            active_preset_id: "".to_string(),
            auto_fallback_enabled: true,
            translate_all_slow_mode: false,
            presets: vec![TranslationPreset {
                id: "openrouter-default".to_string(),
                label: "".to_string(),
                provider_kind: ProviderKind::OpenRouter,
                base_url: None,
                api_key: Some("sk-or-test".to_string()),
                api_key_configured: false,
                model: " openrouter/free ".to_string(),
            }],
        };

        let normalized = settings.normalized();

        assert_eq!(normalized.default_language.code, "zh-CN");
        assert_eq!(normalized.active_preset_id, "openrouter-default");
        assert!(normalized.auto_fallback_enabled);
        assert_eq!(normalized.presets[0].label, "OpenRouter · openrouter/free");
        assert_eq!(normalized.presets[0].api_key.as_deref(), Some("sk-or-test"));
        assert!(normalized.presets[0].api_key_configured);
    }

    #[test]
    fn normalization_gives_ollama_a_default_base_url_and_discards_api_keys() {
        let settings = AppSettings {
            theme: AppTheme::System,
            default_language: SettingsLanguage::default(),
            active_preset_id: "ollama".to_string(),
            auto_fallback_enabled: false,
            translate_all_slow_mode: false,
            presets: vec![TranslationPreset {
                id: "ollama".to_string(),
                label: "".to_string(),
                provider_kind: ProviderKind::Ollama,
                base_url: None,
                api_key: Some("ignored".to_string()),
                api_key_configured: true,
                model: " llama3.2 ".to_string(),
            }],
        };

        let normalized = settings.normalized();

        assert_eq!(normalized.presets[0].label, "Ollama · llama3.2");
        assert_eq!(
            normalized.presets[0].base_url.as_deref(),
            Some("http://localhost:11434/v1")
        );
        assert_eq!(normalized.presets[0].api_key, None);
        assert!(!normalized.presets[0].api_key_configured);
    }

    #[test]
    fn normalization_keeps_empty_preset_state() {
        let settings = AppSettings {
            theme: AppTheme::System,
            default_language: SettingsLanguage {
                code: "zh-CN".to_string(),
                label: "Chinese (Simplified)".to_string(),
            },
            active_preset_id: "".to_string(),
            auto_fallback_enabled: false,
            translate_all_slow_mode: false,
            presets: vec![],
        };

        let normalized = settings.normalized();

        assert_eq!(normalized.active_preset_id, "");
        assert!(normalized.presets.is_empty());
    }

    #[test]
    fn migration_with_no_legacy_providers_stays_empty() {
        let legacy = TranslationProviders {
            active_provider_id: "".to_string(),
            providers: vec![],
        };

        let settings = migrate_legacy_translation_providers(legacy, None, None);

        assert_eq!(settings.active_preset_id, "");
        assert!(settings.presets.is_empty());
    }

    #[test]
    fn migration_drops_seeded_legacy_placeholder_providers() {
        let settings = migrate_legacy_translation_providers(
            TranslationProviders::default_with_openrouter_key(None),
            None,
            None,
        );

        assert_eq!(settings.active_preset_id, "");
        assert!(settings.presets.is_empty());
    }

    #[test]
    fn normalization_drops_seeded_legacy_placeholder_presets_from_saved_settings() {
        let settings = AppSettings {
            theme: AppTheme::System,
            default_language: SettingsLanguage::default(),
            active_preset_id: "openrouter-openrouter-free".to_string(),
            auto_fallback_enabled: false,
            translate_all_slow_mode: false,
            presets: vec![
                TranslationPreset {
                    id: "openrouter-openrouter-free".to_string(),
                    label: "OpenRouter · openrouter/free".to_string(),
                    provider_kind: ProviderKind::OpenRouter,
                    base_url: None,
                    api_key: None,
                    api_key_configured: false,
                    model: "openrouter/free".to_string(),
                },
                TranslationPreset {
                    id: "deepseek-deepseek-chat".to_string(),
                    label: "DeepSeek · deepseek-chat".to_string(),
                    provider_kind: ProviderKind::DeepSeek,
                    base_url: Some("https://api.deepseek.com".to_string()),
                    api_key: None,
                    api_key_configured: false,
                    model: "deepseek-chat".to_string(),
                },
                TranslationPreset {
                    id: "openai-compatible-gpt-4o-mini".to_string(),
                    label: "Custom · gpt-4o-mini".to_string(),
                    provider_kind: ProviderKind::OpenAiCompatible,
                    base_url: None,
                    api_key: None,
                    api_key_configured: false,
                    model: "gpt-4o-mini".to_string(),
                },
                TranslationPreset {
                    id: "ollama-llama3-2".to_string(),
                    label: "Ollama · llama3.2".to_string(),
                    provider_kind: ProviderKind::Ollama,
                    base_url: Some("http://localhost:11434/v1".to_string()),
                    api_key: None,
                    api_key_configured: false,
                    model: "llama3.2".to_string(),
                },
            ],
        };

        let normalized = settings.normalized();

        assert_eq!(normalized.active_preset_id, "");
        assert!(normalized.presets.is_empty());
    }

    #[test]
    fn normalization_keeps_user_created_blank_preset_drafts() {
        let settings = AppSettings {
            theme: AppTheme::System,
            default_language: SettingsLanguage::default(),
            active_preset_id: "preset-123".to_string(),
            auto_fallback_enabled: false,
            translate_all_slow_mode: false,
            presets: vec![TranslationPreset {
                id: "preset-123".to_string(),
                label: "Custom".to_string(),
                provider_kind: ProviderKind::OpenAiCompatible,
                base_url: None,
                api_key: None,
                api_key_configured: false,
                model: "".to_string(),
            }],
        };

        let normalized = settings.normalized();

        assert_eq!(normalized.active_preset_id, "preset-123");
        assert_eq!(normalized.presets.len(), 1);
        assert_eq!(normalized.presets[0].id, "preset-123");
        assert_eq!(normalized.presets[0].model, "");
        assert_eq!(normalized.presets[0].label, "Custom");
    }
}
