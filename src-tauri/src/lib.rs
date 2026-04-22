mod app_settings;
mod page_cache;
mod providers;

use app_settings::{
    merge_app_settings, migrate_legacy_translation_providers, AppSettings, SettingsLanguage,
    TranslationPreset,
};
use chrono::{DateTime, Utc};
use page_cache::{
    clear_cached_page, clear_cached_pages_for_document, find_cached_page_translation,
    list_cached_pages, page_cache_key, CachedPageTranslation, PageTranslationCache,
    PAGE_PROMPT_VERSION,
};
use providers::{list_models, request_chat_completion, ProviderConfig, TranslationProviders};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::fs;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[derive(Debug, Deserialize)]
struct TargetLanguage {
    label: String,
    code: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct TranslateSentence {
    sid: String,
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TranslationResult {
    sid: String,
    translation: String,
}

// Flexible struct to handle various LLM response formats
#[derive(Debug, Deserialize)]
struct FlexibleTranslationResult {
    sid: String,
    #[serde(
        alias = "translation",
        alias = "translated_text",
        alias = "text",
        alias = "translated"
    )]
    translation: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct CachedTranslations {
    entries: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TranslationFallbackTrace {
    requested_preset_id: String,
    final_preset_id: String,
    used_fallback: bool,
    attempted_preset_ids: Vec<String>,
    attempt_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationFallbackProgressEvent {
    request_id: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TranslationFallbackFailureEvent {
    request_id: String,
    trace: TranslationFallbackTrace,
}

const SENTENCE_PROMPT_VERSION: &str = "sentence-v1";
const PRESET_TEST_SAMPLE_TEXT: &str = "This is a short translation test.";
const FALLBACK_PROGRESS_EVENT: &str = "translation-fallback-progress";
const FALLBACK_FAILURE_EVENT: &str = "translation-fallback-failure";

const LEGACY_APP_IDENTIFIER: &str = "com.xnu.pdfread";
const MIGRATABLE_APP_CONFIG_FILES: &[&str] = &[
    "translation_cache.json",
    "page_translation_cache.json",
    "translation_providers.json",
    "app_settings.json",
    "openrouter_key.txt",
    "vocabulary.json",
    "recent_books.json",
];

fn app_config_dir(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    handle
        .path()
        .app_config_dir()
        .map_err(|_| "Failed to resolve app config directory.".to_string())
}

fn legacy_app_config_dir(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let current = app_config_dir(handle)?;
    let parent = current
        .parent()
        .ok_or_else(|| "Failed to resolve app config parent directory.".to_string())?;
    Ok(parent.join(LEGACY_APP_IDENTIFIER))
}

fn migrate_legacy_app_config(handle: &tauri::AppHandle) -> Result<(), String> {
    let current_dir = app_config_dir(handle)?;
    let legacy_dir = legacy_app_config_dir(handle)?;

    if current_dir == legacy_dir || !legacy_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(&current_dir).map_err(|e| e.to_string())?;

    for file_name in MIGRATABLE_APP_CONFIG_FILES {
        let legacy_file = legacy_dir.join(file_name);
        let current_file = current_dir.join(file_name);

        if current_file.exists() || !legacy_file.exists() {
            continue;
        }

        fs::copy(&legacy_file, &current_file).map_err(|error| {
            format!(
                "Failed to migrate legacy app data from {} to {}: {}",
                legacy_file.display(),
                current_file.display(),
                error
            )
        })?;
    }

    Ok(())
}

fn cache_file_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("translation_cache.json"))
}

fn page_cache_file_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("page_translation_cache.json"))
}

fn provider_settings_file_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("translation_providers.json"))
}

fn app_settings_file_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("app_settings.json"))
}

fn openrouter_key_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("openrouter_key.txt"))
}

fn vocabulary_file_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("vocabulary.json"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VocabularyEntry {
    word: String,
    phonetic: Option<String>,
    definitions: Vec<WordDefinitionResult>,
    added_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct VocabularyData {
    entries: Vec<VocabularyEntry>,
}

fn load_vocabulary(handle: &tauri::AppHandle) -> Result<VocabularyData, String> {
    let path = vocabulary_file_path(handle)?;
    if !path.exists() {
        return Ok(VocabularyData {
            entries: Vec::new(),
        });
    }
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_vocabulary(handle: &tauri::AppHandle, vocab: &VocabularyData) -> Result<(), String> {
    let path = vocabulary_file_path(handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(vocab).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())
}

fn load_page_cache(handle: &tauri::AppHandle) -> Result<PageTranslationCache, String> {
    let path = page_cache_file_path(handle)?;
    if !path.exists() {
        return Ok(PageTranslationCache::default());
    }
    let data = fs::read_to_string(path)
        .map_err(|e| format!("readani could not read the local translation cache: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("readani could not read the local translation cache: {}", e))
}

fn save_page_cache(handle: &tauri::AppHandle, cache: &PageTranslationCache) -> Result<(), String> {
    let path = page_cache_file_path(handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
    fs::write(path, data)
        .map_err(|e| format!("readani could not save the local translation cache: {}", e))
}

fn load_cache(handle: &tauri::AppHandle) -> Result<CachedTranslations, String> {
    let path = cache_file_path(handle)?;
    if !path.exists() {
        return Ok(CachedTranslations {
            entries: HashMap::new(),
        });
    }
    let data = fs::read_to_string(path)
        .map_err(|e| format!("readani could not read the local translation cache: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("readani could not read the local translation cache: {}", e))
}

fn save_cache(handle: &tauri::AppHandle, cache: &CachedTranslations) -> Result<(), String> {
    let path = cache_file_path(handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(cache).map_err(|e| e.to_string())?;
    fs::write(path, data)
        .map_err(|e| format!("readani could not save the local translation cache: {}", e))
}

fn load_legacy_openrouter_key(handle: &tauri::AppHandle) -> Result<String, String> {
    let path = openrouter_key_path(handle)?;
    let key = fs::read_to_string(&path)
        .map_err(|_| format!("Missing OpenRouter API key at: {}", path.display()))?;
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("OpenRouter API key file is empty.".to_string());
    }
    Ok(trimmed.to_string())
}

fn sync_openrouter_key_file(handle: &tauri::AppHandle, key: Option<&str>) -> Result<(), String> {
    let path = openrouter_key_path(handle)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    match key.map(str::trim).filter(|value| !value.is_empty()) {
        Some(value) => fs::write(path, value).map_err(|e| e.to_string()),
        None => match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        },
    }
}

fn normalize_translation_providers(
    mut providers: TranslationProviders,
    openrouter_key: Option<String>,
) -> TranslationProviders {
    let defaults = TranslationProviders::default_with_openrouter_key(openrouter_key);

    for provider in &mut providers.providers {
        provider.normalize();
    }

    for default in defaults.providers {
        if let Some(existing) = providers
            .providers
            .iter_mut()
            .find(|provider| provider.id == default.id)
        {
            if existing.base_url.is_none() {
                existing.base_url = default.base_url.clone();
            }
            if existing.default_model.is_none() {
                existing.default_model = default.default_model.clone();
            }
            if existing.api_key.is_none() {
                existing.api_key = default.api_key.clone();
            }
            existing.api_key_configured = existing
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some();
        } else {
            providers.providers.push(default);
        }
    }

    if providers.active_provider_id.trim().is_empty()
        || !providers
            .providers
            .iter()
            .any(|provider| provider.id == providers.active_provider_id)
    {
        providers.active_provider_id = "openrouter".to_string();
    }

    providers
}

fn load_translation_providers(handle: &tauri::AppHandle) -> Result<TranslationProviders, String> {
    let path = provider_settings_file_path(handle)?;
    let openrouter_key = load_legacy_openrouter_key(handle).ok();

    if !path.exists() {
        return Ok(TranslationProviders::default_with_openrouter_key(
            openrouter_key,
        ));
    }

    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let providers: TranslationProviders = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    Ok(normalize_translation_providers(providers, openrouter_key))
}

fn load_app_settings(handle: &tauri::AppHandle) -> Result<AppSettings, String> {
    let path = app_settings_file_path(handle)?;

    if path.exists() {
        let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let settings: AppSettings = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        return Ok(settings.normalized());
    }

    let legacy_path = provider_settings_file_path(handle)?;
    if !legacy_path.exists() {
        return Ok(AppSettings::default());
    }

    let legacy = load_translation_providers(handle)?;
    Ok(migrate_legacy_translation_providers(legacy, None, None))
}

fn save_app_settings_internal(
    handle: &tauri::AppHandle,
    settings: &AppSettings,
) -> Result<(), String> {
    let path = app_settings_file_path(handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let normalized = settings.normalized();
    let data = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())?;

    let openrouter_key = normalized
        .presets
        .iter()
        .find(|preset| matches!(preset.provider_kind, providers::ProviderKind::OpenRouter))
        .and_then(|preset| preset.api_key.as_deref());
    sync_openrouter_key_file(handle, openrouter_key)?;

    Ok(())
}

fn resolve_preset(
    handle: &tauri::AppHandle,
    preset_id: Option<&str>,
) -> Result<TranslationPreset, String> {
    let settings = load_app_settings(handle)?;
    match preset_id.map(str::trim).filter(|value| !value.is_empty()) {
        Some(id) => settings.preset(id),
        None => settings.active_preset(),
    }
}

fn preset_has_translation_context(preset: &TranslationPreset) -> bool {
    !preset.id.trim().is_empty() && !preset.model.trim().is_empty()
}

fn build_fallback_preset_sequence(
    settings: &AppSettings,
    requested_preset_id: &str,
) -> Result<Vec<TranslationPreset>, String> {
    let requested_index = settings
        .presets
        .iter()
        .position(|preset| preset.id == requested_preset_id)
        .ok_or_else(|| format!("Unknown preset: {}", requested_preset_id))?;

    let requested = settings.presets[requested_index].clone().normalized();
    let mut ordered = vec![requested];

    if !settings.auto_fallback_enabled {
        return Ok(ordered);
    }

    for offset in 1..settings.presets.len() {
        let index = (requested_index + offset) % settings.presets.len();
        let candidate = settings.presets[index].clone().normalized();

        if !preset_has_translation_context(&candidate) {
            continue;
        }

        if candidate.to_provider_config().validate_for_request().is_ok() {
            ordered.push(candidate);
        }
    }

    Ok(ordered)
}

fn summarize_fallback_error_for_progress(error: &str) -> &'static str {
    let normalized = error.to_lowercase();

    if normalized.contains("timed out") || normalized.contains("timeout") {
        return "timed out";
    }
    if normalized.contains("invalid api key")
        || normalized.contains("incorrect api key")
        || normalized.contains("unauthorized")
        || normalized.contains("401")
    {
        return "was not accepted";
    }
    if normalized.contains("too many requests")
        || normalized.contains("rate limit")
        || normalized.contains("429")
    {
        return "hit a rate limit";
    }
    if normalized.contains("quota")
        || normalized.contains("insufficient")
        || normalized.contains("credit")
        || normalized.contains("balance")
        || normalized.contains("payment required")
        || normalized.contains("402")
    {
        return "ran out of usage";
    }
    if (normalized.contains("model") && normalized.contains("not found"))
        || normalized.contains("unknown model")
        || normalized.contains("invalid model")
    {
        return "does not support that model";
    }
    if normalized.contains("error sending request")
        || normalized.contains("error trying to connect")
        || normalized.contains("client error (connect)")
        || normalized.contains("connection refused")
        || normalized.contains("connection reset")
        || normalized.contains("connection closed before message completed")
        || normalized.contains("broken pipe")
        || normalized.contains("tls")
        || normalized.contains("certificate")
    {
        return "could not connect";
    }

    "failed"
}

fn should_retry_with_fallback(error: &str) -> bool {
    let normalized = error.to_lowercase();

    if normalized.contains("could not save this page locally")
        || normalized.contains("could not save these results locally")
        || normalized.contains("could not read the local translation cache")
    {
        return false;
    }

    normalized.contains("no active preset configured")
        || normalized.contains("no preset configured")
        || normalized.contains("api key is missing")
        || normalized.contains("base url is missing")
        || normalized.contains("invalid api key")
        || normalized.contains("incorrect api key")
        || normalized.contains("api key was not accepted")
        || normalized.contains("unauthorized")
        || normalized.contains("401")
        || ((normalized.contains("model") && normalized.contains("not found"))
            || normalized.contains("unknown model")
            || normalized.contains("invalid model"))
        || normalized.contains("base url")
        || normalized.contains("not found")
        || normalized.contains("404")
        || normalized.contains("does not use a base url")
        || normalized.contains("enotfound")
        || normalized.contains("dns")
        || normalized.contains("error sending request")
        || normalized.contains("error trying to connect")
        || normalized.contains("client error (connect)")
        || normalized.contains("connection refused")
        || normalized.contains("connection reset")
        || normalized.contains("connection closed before message completed")
        || normalized.contains("broken pipe")
        || normalized.contains("tls")
        || normalized.contains("certificate")
        || normalized.contains("too many requests")
        || normalized.contains("rate limit")
        || normalized.contains("429")
        || normalized.contains("quota")
        || normalized.contains("insufficient")
        || normalized.contains("credit")
        || normalized.contains("balance")
        || normalized.contains("payment required")
        || normalized.contains("402")
        || normalized.contains("maximum context length")
        || normalized.contains("context_length_exceeded")
        || normalized.contains("prompt is too long")
        || normalized.contains("too many tokens")
        || normalized.contains("context window")
        || normalized.contains("input is too long")
        || normalized.contains("service unavailable")
        || normalized.contains("bad gateway")
        || normalized.contains("gateway timeout")
        || normalized.contains("502")
        || normalized.contains("503")
        || normalized.contains("504")
        || normalized.contains("returned unreadable json")
        || normalized.contains("failed to parse translation json")
        || normalized.contains("returned no choices")
        || normalized.contains("without text content")
        || normalized.contains("unsupported response format")
        || normalized.contains("returned an empty translation")
        || normalized.contains("returned incomplete translations")
        || normalized.contains("timed out")
        || normalized.contains("timeout")
        || normalized.contains("failed to fetch")
        || normalized.contains("network")
        || normalized.contains("connection")
        || normalized.contains("socket")
}

fn emit_fallback_progress(
    handle: &tauri::AppHandle,
    request_id: Option<&str>,
    failed_preset: &TranslationPreset,
    next_preset: &TranslationPreset,
    error: &str,
    next_attempt_index: usize,
    attempt_count: usize,
) {
    let Some(request_id) = request_id else {
        return;
    };

    let payload = TranslationFallbackProgressEvent {
        request_id: request_id.to_string(),
        message: format!(
            "{} {}. Trying {} ({}/{})...",
            failed_preset.label,
            summarize_fallback_error_for_progress(error),
            next_preset.label,
            next_attempt_index + 1,
            attempt_count
        ),
    };

    let _ = handle.emit(FALLBACK_PROGRESS_EVENT, payload);
}

fn emit_fallback_failure(
    handle: &tauri::AppHandle,
    request_id: Option<&str>,
    trace: &TranslationFallbackTrace,
) {
    let Some(request_id) = request_id else {
        return;
    };

    let payload = TranslationFallbackFailureEvent {
        request_id: request_id.to_string(),
        trace: trace.clone(),
    };

    let _ = handle.emit(FALLBACK_FAILURE_EVENT, payload);
}

async fn execute_with_preset_fallback<T, F, Fut>(
    handle: &tauri::AppHandle,
    requested_preset_id: &str,
    request_id: Option<&str>,
    mut execute: F,
) -> Result<(T, TranslationFallbackTrace), String>
where
    F: FnMut(TranslationPreset) -> Fut,
    Fut: Future<Output = Result<T, String>>,
{
    let settings = load_app_settings(handle)?;
    let presets = build_fallback_preset_sequence(&settings, requested_preset_id)?;
    let attempt_count = presets.len();
    let mut attempted_preset_ids = Vec::with_capacity(attempt_count);
    let mut last_error: Option<String> = None;

    for (index, preset) in presets.iter().cloned().enumerate() {
        attempted_preset_ids.push(preset.id.clone());

        match execute(preset.clone()).await {
            Ok(value) => {
                return Ok((
                    value,
                    TranslationFallbackTrace {
                        requested_preset_id: requested_preset_id.to_string(),
                        final_preset_id: preset.id,
                        used_fallback: index > 0,
                        attempted_preset_ids,
                        attempt_count: index + 1,
                        last_error,
                    },
                ));
            }
            Err(error) => {
                let has_next = index + 1 < presets.len();
                let retryable = has_next && should_retry_with_fallback(&error);
                last_error = Some(error.clone());

                if retryable {
                    emit_fallback_progress(
                        handle,
                        request_id,
                        &preset,
                        &presets[index + 1],
                        &error,
                        index + 1,
                        attempt_count,
                    );
                    continue;
                }

                let trace = TranslationFallbackTrace {
                    requested_preset_id: requested_preset_id.to_string(),
                    final_preset_id: preset.id,
                    used_fallback: index > 0,
                    attempted_preset_ids,
                    attempt_count: index + 1,
                    last_error: Some(error.clone()),
                };
                emit_fallback_failure(handle, request_id, &trace);
                return Err(error);
            }
        }
    }

    let error = last_error.unwrap_or_else(|| "Translation failed.".to_string());
    let trace = TranslationFallbackTrace {
        requested_preset_id: requested_preset_id.to_string(),
        final_preset_id: requested_preset_id.to_string(),
        used_fallback: false,
        attempted_preset_ids,
        attempt_count: 0,
        last_error: Some(error.clone()),
    };
    emit_fallback_failure(handle, request_id, &trace);
    Err(error)
}

fn merge_saved_preset_credentials(
    saved_presets: &[TranslationPreset],
    mut incoming: TranslationPreset,
) -> TranslationPreset {
    if !incoming.provider_kind.uses_api_key() {
        incoming.api_key = None;
        incoming.api_key_configured = false;
        return incoming;
    }

    if let Some(saved) = saved_presets.iter().find(|preset| preset.id == incoming.id) {
        let incoming_key_missing = incoming
            .api_key
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .is_empty();

        if incoming_key_missing {
            incoming.api_key = saved.api_key.clone();
            incoming.api_key_configured = saved
                .api_key
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some();
        }
    }

    incoming
}

fn merge_translation_providers(
    existing: TranslationProviders,
    mut incoming: TranslationProviders,
) -> TranslationProviders {
    if incoming.active_provider_id.trim().is_empty() {
        incoming.active_provider_id = existing.active_provider_id.clone();
    }

    for provider in &mut incoming.providers {
        if let Some(saved) = existing
            .providers
            .iter()
            .find(|candidate| candidate.id == provider.id)
        {
            provider.base_url = provider.base_url.take().or_else(|| saved.base_url.clone());
            provider.default_model = provider
                .default_model
                .take()
                .or_else(|| saved.default_model.clone());
            provider.api_key = match provider.api_key.take() {
                Some(key) if key.trim().is_empty() => None,
                Some(key) => Some(key.trim().to_string()),
                None => saved.api_key.clone(),
            };
        } else {
            provider.normalize();
        }
    }

    normalize_translation_providers(incoming, None)
}

fn save_translation_providers_internal(
    handle: &tauri::AppHandle,
    providers: &TranslationProviders,
) -> Result<(), String> {
    let path = provider_settings_file_path(handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let normalized = normalize_translation_providers(providers.clone(), None);
    let data = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, data).map_err(|e| e.to_string())?;

    let openrouter_key = normalized
        .providers
        .iter()
        .find(|provider| provider.id == "openrouter")
        .and_then(|provider| provider.api_key.as_deref());
    sync_openrouter_key_file(handle, openrouter_key)?;

    Ok(())
}

fn resolve_provider(
    handle: &tauri::AppHandle,
    provider_id: Option<&str>,
) -> Result<ProviderConfig, String> {
    let providers = load_translation_providers(handle)?;
    match provider_id.map(str::trim).filter(|value| !value.is_empty()) {
        Some(id) => providers.provider(id),
        None => providers.active_provider(),
    }
}

fn load_openrouter_key(handle: &tauri::AppHandle) -> Result<String, String> {
    if let Ok(settings) = load_app_settings(handle) {
        if let Some(api_key) = settings
            .presets
            .iter()
            .find(|preset| matches!(preset.provider_kind, providers::ProviderKind::OpenRouter))
            .and_then(|preset| preset.api_key.as_deref())
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Ok(api_key.to_string());
        }
    }
    load_legacy_openrouter_key(handle)
}

#[derive(Debug, Serialize)]
struct KeyInfo {
    exists: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresetTestResult {
    preset_id: String,
    label: String,
    ok: bool,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

fn settings_language_to_target_language(language: &SettingsLanguage) -> TargetLanguage {
    TargetLanguage {
        label: language.label.clone(),
        code: language.code.clone(),
    }
}

async fn run_preset_test(
    preset: TranslationPreset,
    target_language: &TargetLanguage,
) -> PresetTestResult {
    let normalized = preset.normalized();
    if normalized.model.trim().is_empty() {
        return PresetTestResult {
            preset_id: normalized.id,
            label: normalized.label,
            ok: false,
            message: "Model is required.".to_string(),
            detail: None,
        };
    }
    let provider = normalized.to_provider_config();
    let result = request_chat_completion(
        &provider,
        &normalized.model,
        0.0,
        build_selection_translation_system_prompt(),
        &build_preset_test_prompt(target_language),
    )
    .await;

    match result {
        Ok(_) => PresetTestResult {
            preset_id: normalized.id,
            label: normalized.label,
            ok: true,
            message: "Short translation test passed.".to_string(),
            detail: None,
        },
        Err(error) => {
            let detail = error.clone();
            PresetTestResult {
                preset_id: normalized.id,
                label: normalized.label,
                ok: false,
                message: error,
                detail: Some(detail),
            }
        }
    }
}

#[tauri::command]
fn get_openrouter_key_info(handle: tauri::AppHandle) -> Result<KeyInfo, String> {
    let exists = load_openrouter_key(&handle).is_ok();
    Ok(KeyInfo { exists })
}

#[tauri::command(rename_all = "camelCase")]
fn get_translation_providers(handle: tauri::AppHandle) -> Result<TranslationProviders, String> {
    Ok(load_translation_providers(&handle)?.sanitized())
}

#[tauri::command(rename_all = "camelCase")]
fn get_app_settings(handle: tauri::AppHandle) -> Result<AppSettings, String> {
    Ok(load_app_settings(&handle)?.sanitized())
}

#[tauri::command(rename_all = "camelCase")]
fn save_translation_providers(
    handle: tauri::AppHandle,
    providers: TranslationProviders,
) -> Result<TranslationProviders, String> {
    let existing = load_translation_providers(&handle)?;
    let merged = merge_translation_providers(existing, providers);
    save_translation_providers_internal(&handle, &merged)?;
    Ok(merged.sanitized())
}

#[tauri::command(rename_all = "camelCase")]
fn save_app_settings(
    handle: tauri::AppHandle,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let existing = load_app_settings(&handle)?;
    let merged = merge_app_settings(existing, settings);
    save_app_settings_internal(&handle, &merged)?;
    Ok(merged.sanitized())
}

#[tauri::command]
fn save_openrouter_key(handle: tauri::AppHandle, key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("OpenRouter API key is empty.".to_string());
    }

    let mut providers = load_translation_providers(&handle)?;
    if let Some(provider) = providers
        .providers
        .iter_mut()
        .find(|provider| provider.id == "openrouter")
    {
        provider.api_key = Some(trimmed.to_string());
        provider.normalize();
    }
    save_translation_providers_internal(&handle, &providers)
}

#[tauri::command]
async fn test_openrouter_key(handle: tauri::AppHandle) -> Result<(), String> {
    let provider = resolve_provider(&handle, Some("openrouter"))?;
    list_models(&provider).await.map(|_| ())
}

#[tauri::command(rename_all = "camelCase")]
async fn test_translation_preset(
    handle: tauri::AppHandle,
    preset: TranslationPreset,
) -> Result<PresetTestResult, String> {
    let saved_settings = load_app_settings(&handle)?;
    let merged = merge_saved_preset_credentials(&saved_settings.presets, preset);
    let target_language = settings_language_to_target_language(&saved_settings.default_language);
    Ok(run_preset_test(merged, &target_language).await)
}

#[tauri::command(rename_all = "camelCase")]
async fn test_all_translation_presets(
    handle: tauri::AppHandle,
    presets: Vec<TranslationPreset>,
) -> Result<Vec<PresetTestResult>, String> {
    let saved_settings = load_app_settings(&handle)?;
    let target_language = settings_language_to_target_language(&saved_settings.default_language);
    let mut results = Vec::with_capacity(presets.len());
    for preset in presets {
        let merged = merge_saved_preset_credentials(&saved_settings.presets, preset);
        results.push(run_preset_test(merged, &target_language).await);
    }
    Ok(results)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PageTranslationResponse {
    page: u32,
    translated_text: String,
    is_cached: bool,
    fallback_trace: TranslationFallbackTrace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BatchTranslationResponse {
    results: Vec<TranslationResult>,
    fallback_trace: TranslationFallbackTrace,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectionTranslationResponse {
    translation: String,
    fallback_trace: TranslationFallbackTrace,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageCacheLookupInput {
    page: u32,
    display_text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WordLookupResponse {
    phonetic: Option<String>,
    definitions: Vec<WordDefinitionResult>,
    fallback_trace: TranslationFallbackTrace,
}

#[tauri::command(rename_all = "camelCase")]
async fn list_provider_models(
    handle: tauri::AppHandle,
    provider_id: String,
) -> Result<Vec<String>, String> {
    let provider = resolve_provider(&handle, Some(&provider_id))?;
    list_models(&provider).await
}

#[tauri::command(rename_all = "camelCase")]
async fn list_preset_models(
    handle: tauri::AppHandle,
    preset: TranslationPreset,
) -> Result<Vec<String>, String> {
    let saved_settings = load_app_settings(&handle)?;
    let merged = merge_saved_preset_credentials(&saved_settings.presets, preset);
    let provider = merged.normalized().to_provider_config();
    list_models(&provider).await
}

async fn translate_page_text_with_preset(
    handle: &tauri::AppHandle,
    preset: &TranslationPreset,
    temperature: f32,
    target_language: &TargetLanguage,
    doc_id: &str,
    page: u32,
    display_text: &str,
    previous_context: &str,
    next_context: &str,
) -> Result<(String, bool), String> {
    let provider = preset.to_provider_config();
    let source_hash = hash_source_text(display_text);
    let cache_key = page_cache_key(
        doc_id,
        page,
        &source_hash,
        &preset.id,
        &preset.model,
        &target_language.code,
        PAGE_PROMPT_VERSION,
    );

    let mut cache = load_page_cache(handle)?;
    if let Some(entry) = find_cached_page_translation(
        &cache,
        doc_id,
        page,
        &source_hash,
        &preset.id,
        &preset.model,
        &target_language.code,
        PAGE_PROMPT_VERSION,
    ) {
        return Ok((entry.translated_text.clone(), true));
    }

    let translated_text = request_chat_completion(
        &provider,
        &preset.model,
        temperature,
        &build_page_translation_system_prompt(),
        &build_page_translation_prompt(
            target_language,
            display_text,
            previous_context.trim(),
            next_context.trim(),
        ),
    )
    .await?;
    let translated_text = translated_text.trim().to_string();

    if translated_text.is_empty() {
        return Err(format!("{} returned an empty translation.", provider.label));
    }

    cache.entries.insert(
        cache_key,
        CachedPageTranslation {
            page,
            translated_text: translated_text.clone(),
            source_hash,
            provider_id: preset.id.clone(),
            model: preset.model.clone(),
            language: target_language.code.clone(),
            prompt_version: PAGE_PROMPT_VERSION.to_string(),
            cached_at: Utc::now(),
        },
    );
    save_page_cache(handle, &cache).map_err(|error| {
        format!(
            "Translation succeeded, but readani could not save this page locally: {}",
            error
        )
    })?;

    Ok((translated_text, false))
}

#[tauri::command(rename_all = "camelCase")]
async fn translate_page_text(
    handle: tauri::AppHandle,
    preset_id: String,
    _model: String,
    temperature: f32,
    target_language: TargetLanguage,
    doc_id: String,
    page: u32,
    display_text: String,
    previous_context: String,
    next_context: String,
    request_id: Option<String>,
) -> Result<PageTranslationResponse, String> {
    let trimmed_display = display_text.trim();
    if trimmed_display.is_empty() {
        return Err("Page text is empty.".to_string());
    }
    let (result, fallback_trace) = execute_with_preset_fallback(
        &handle,
        &preset_id,
        request_id.as_deref(),
        |preset| async {
            translate_page_text_with_preset(
                &handle,
                &preset,
                temperature,
                &target_language,
                &doc_id,
                page,
                trimmed_display,
                &previous_context,
                &next_context,
            )
            .await
        },
    )
    .await?;

    let (translated_text, is_cached) = result;
    Ok(PageTranslationResponse {
        page,
        translated_text,
        is_cached,
        fallback_trace,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn list_cached_page_translations(
    handle: tauri::AppHandle,
    preset_id: String,
    model: String,
    target_language: TargetLanguage,
    doc_id: String,
    pages: Vec<PageCacheLookupInput>,
) -> Result<Vec<u32>, String> {
    let cache = load_page_cache(&handle)?;
    let cached_pages =
        list_cached_pages(&cache, &doc_id, &preset_id, &model, &target_language.code, PAGE_PROMPT_VERSION);

    let candidate_pages: std::collections::HashSet<u32> = cached_pages.into_iter().collect();
    let mut matches = Vec::new();

    for input in pages {
        let trimmed_display = input.display_text.trim();
        if trimmed_display.is_empty() || !candidate_pages.contains(&input.page) {
            continue;
        }

        let source_hash = hash_source_text(trimmed_display);
        if find_cached_page_translation(
            &cache,
            &doc_id,
            input.page,
            &source_hash,
            &preset_id,
            &model,
            &target_language.code,
            PAGE_PROMPT_VERSION,
        )
        .is_some()
        {
            matches.push(input.page);
        }
    }

    matches.sort_unstable();
    matches.dedup();
    Ok(matches)
}

#[tauri::command(rename_all = "camelCase")]
fn get_cached_page_translation(
    handle: tauri::AppHandle,
    preset_id: String,
    model: String,
    target_language: TargetLanguage,
    doc_id: String,
    page: u32,
    display_text: String,
) -> Result<Option<PageTranslationResponse>, String> {
    let trimmed_display = display_text.trim();
    if trimmed_display.is_empty() {
        return Ok(None);
    }

    let source_hash = hash_source_text(trimmed_display);
    let cache = load_page_cache(&handle)?;
    let entry = find_cached_page_translation(
        &cache,
        &doc_id,
        page,
        &source_hash,
        &preset_id,
        &model,
        &target_language.code,
        PAGE_PROMPT_VERSION,
    );

    Ok(entry.map(|entry| PageTranslationResponse {
        page,
        translated_text: entry.translated_text,
        is_cached: true,
        fallback_trace: TranslationFallbackTrace {
            requested_preset_id: preset_id.clone(),
            final_preset_id: preset_id.clone(),
            used_fallback: false,
            attempted_preset_ids: vec![preset_id.clone()],
            attempt_count: 1,
            last_error: None,
        },
    }))
}

#[tauri::command(rename_all = "camelCase")]
fn clear_cached_page_translation(
    handle: tauri::AppHandle,
    preset_id: String,
    model: String,
    target_language: TargetLanguage,
    doc_id: String,
    page: u32,
) -> Result<(), String> {
    let mut cache = load_page_cache(&handle)?;
    clear_cached_page(
        &mut cache,
        &doc_id,
        page,
        &preset_id,
        &model,
        &target_language.code,
        PAGE_PROMPT_VERSION,
    );
    save_page_cache(&handle, &cache)
}

#[tauri::command(rename_all = "camelCase")]
fn clear_document_page_translations(
    handle: tauri::AppHandle,
    preset_id: String,
    model: String,
    target_language: TargetLanguage,
    doc_id: String,
) -> Result<(), String> {
    let mut cache = load_page_cache(&handle)?;
    clear_cached_pages_for_document(
        &mut cache,
        &doc_id,
        &preset_id,
        &model,
        &target_language.code,
        PAGE_PROMPT_VERSION,
    );
    save_page_cache(&handle, &cache)
}

#[tauri::command(rename_all = "camelCase")]
async fn translate_selection_text(
    handle: tauri::AppHandle,
    preset_id: String,
    _model: String,
    target_language: TargetLanguage,
    text: String,
) -> Result<SelectionTranslationResponse, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Selection text is empty.".to_string());
    }

    let (translation, fallback_trace) = execute_with_preset_fallback(
        &handle,
        &preset_id,
        None,
        |preset| async {
            let provider = preset.to_provider_config();
            let translation = request_chat_completion(
                &provider,
                &preset.model,
                0.0,
                build_selection_translation_system_prompt(),
                &build_selection_translation_prompt(&target_language, trimmed),
            )
            .await?;

            Ok(translation.trim().to_string())
        },
    )
    .await?;

    Ok(SelectionTranslationResponse {
        translation,
        fallback_trace,
    })
}

fn build_system_prompt() -> String {
    [
        "You are a translation engine.",
        "Translate into the specified target language.",
        "Output STRICT JSON ONLY.",
        "No markdown, no explanations, no extra text.",
    ]
    .join(" ")
}

fn build_word_lookup_system_prompt() -> String {
    [
        "You are a dictionary lookup engine.",
        "Provide word definitions in dictionary format.",
        "Output STRICT JSON ONLY.",
        "No markdown, no explanations, no extra text.",
    ]
    .join(" ")
}

fn target_language_prompt_text(target_language: &TargetLanguage) -> String {
    let label = target_language.label.trim();
    let code = target_language.code.trim();

    if label.is_empty() {
        return code.to_string();
    }

    if code.is_empty() || code.starts_with("custom:") || code.eq_ignore_ascii_case(label) {
        return label.to_string();
    }

    format!("{} ({})", label, code)
}

fn build_word_lookup_prompt(word: &str, target_language: &TargetLanguage) -> String {
    let target = target_language_prompt_text(target_language);
    let label = target_language.label.trim();
    let meaning_language = if label.is_empty() {
        target.as_str()
    } else {
        label
    };

    format!(
        r#"Look up the word "{}" and provide its definition in {}.
Return JSON in this exact format:
{{"phonetic": "/phonetic transcription/", "definitions": [{{"pos": "n.", "meanings": "meaning1; meaning2"}}, {{"pos": "v.", "meanings": "meaning1; meaning2"}}]}}
- phonetic: IPA pronunciation
- definitions: array of objects with pos (part of speech like n., v., adj., adv., etc.) and meanings (translations separated by semicolons)
- Only include parts of speech that apply to this word
- Meanings should be in {}"#,
        word, target, meaning_language
    )
}

#[derive(Debug, Serialize, Deserialize)]
struct WordLookupResult {
    phonetic: Option<String>,
    definitions: Vec<WordDefinitionResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WordDefinitionResult {
    pos: String,
    meanings: String,
}

fn build_user_prompt(target_language: &TargetLanguage, sentences: &[TranslateSentence]) -> String {
    let payload = serde_json::to_string(sentences).unwrap_or_else(|_| "[]".to_string());
    let target = target_language_prompt_text(target_language);
    format!(
        "Target language: {}\nTranslation style: faithful, clear, readable\nInput JSON: {}",
        target, payload
    )
}

fn build_page_translation_system_prompt() -> String {
    [
        "You are a book page translation engine.",
        "Translate only the main page text into the requested target language.",
        "Use the neighboring page text only as context for spillover sentences.",
        "Return plain reading text only.",
        "Do not add notes, labels, markdown, or explanations.",
    ]
    .join(" ")
}

fn build_page_translation_prompt(
    target_language: &TargetLanguage,
    display_text: &str,
    previous_context: &str,
    next_context: &str,
) -> String {
    let target = target_language_prompt_text(target_language);
    let previous = if previous_context.is_empty() {
        "(none)"
    } else {
        previous_context
    };
    let next = if next_context.is_empty() {
        "(none)"
    } else {
        next_context
    };

    format!(
        "Target language: {}\nRules:\n- Translate ONLY the main page text.\n- Use previous and next context only to resolve page-break spillover.\n- Prefer readable prose over literal phrasing.\n- Ignore OCR noise when possible.\n- Return plain text only.\n\nPrevious page context:\n{}\n\nMain page text:\n{}\n\nNext page context:\n{}",
        target,
        previous,
        display_text,
        next
    )
}

fn build_selection_translation_system_prompt() -> &'static str {
    "You are a translation helper. Translate the selected text into the requested target language and return only the translation."
}

fn build_selection_translation_prompt(target_language: &TargetLanguage, text: &str) -> String {
    let target = target_language_prompt_text(target_language);
    format!("Target language: {}\nSelected text:\n{}", target, text)
}

fn build_preset_test_prompt(target_language: &TargetLanguage) -> String {
    build_selection_translation_prompt(target_language, PRESET_TEST_SAMPLE_TEXT)
}

#[tauri::command]
fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    let path_ref = std::path::Path::new(&path);

    // Check if the path is a directory (macOS treats some epub files as bundles)
    if path_ref.is_dir() {
        // If it's a directory (epub bundle), zip it into memory
        return zip_directory_to_bytes(path_ref);
    }

    fs::read(&path).map_err(|e| e.to_string())
}

fn zip_directory_to_bytes(dir_path: &std::path::Path) -> Result<Vec<u8>, String> {
    use std::io::{Read, Write};
    use walkdir::WalkDir;
    use zip::write::SimpleFileOptions;

    let mut buffer = std::io::Cursor::new(Vec::new());

    {
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        for entry in WalkDir::new(dir_path) {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let relative_path = path.strip_prefix(dir_path).map_err(|e| e.to_string())?;

            // Skip the root directory itself
            if relative_path.as_os_str().is_empty() {
                continue;
            }

            let relative_str = relative_path.to_string_lossy();

            if path.is_file() {
                zip.start_file(relative_str.to_string(), options)
                    .map_err(|e| e.to_string())?;
                let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
                let mut contents = Vec::new();
                file.read_to_end(&mut contents).map_err(|e| e.to_string())?;
                zip.write_all(&contents).map_err(|e| e.to_string())?;
            } else if path.is_dir() {
                // Add directory entry
                zip.add_directory(format!("{}/", relative_str), options)
                    .map_err(|e| e.to_string())?;
            }
        }

        zip.finish().map_err(|e| e.to_string())?;
    }

    Ok(buffer.into_inner())
}

fn parse_translation_json(content: &str) -> Result<Vec<TranslationResult>, String> {
    // Try to extract JSON array from the content (handle markdown code blocks)
    let json_content = extract_json_array(content);

    // Try flexible parsing first
    let parsed: Vec<FlexibleTranslationResult> = serde_json::from_str(&json_content)
        .map_err(|e| format!("{} (content: {})", e, truncate_for_error(&json_content)))?;

    // Convert to TranslationResult, filtering out items without translation
    let results: Vec<TranslationResult> = parsed
        .into_iter()
        .filter_map(|item| {
            item.translation.map(|t| TranslationResult {
                sid: item.sid,
                translation: t,
            })
        })
        .collect();

    Ok(results)
}

fn extract_json_array(content: &str) -> String {
    let trimmed = content.trim();

    // If it starts with [, it's already JSON
    if trimmed.starts_with('[') {
        return trimmed.to_string();
    }

    // Try to extract from markdown code block
    if let Some(start) = trimmed.find("```json") {
        if let Some(end) = trimmed[start..]
            .find("```\n")
            .or_else(|| trimmed[start..].rfind("```"))
        {
            let json_start = start + 7; // length of "```json"
            let json_end = start + end;
            if json_start < json_end {
                return trimmed[json_start..json_end].trim().to_string();
            }
        }
    }

    // Try to extract from generic code block
    if let Some(start) = trimmed.find("```") {
        let after_tick = &trimmed[start + 3..];
        if let Some(end) = after_tick.find("```") {
            // Skip optional language identifier on first line
            let block_content = &after_tick[..end];
            if let Some(newline) = block_content.find('\n') {
                return block_content[newline + 1..].trim().to_string();
            }
            return block_content.trim().to_string();
        }
    }

    // Try to find JSON array in the content
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            if start < end {
                return trimmed[start..=end].to_string();
            }
        }
    }

    trimmed.to_string()
}

fn truncate_for_error(s: &str) -> String {
    if s.len() > 200 {
        format!("{}...", &s[..200])
    } else {
        s.to_string()
    }
}

fn hash_source_text(text: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn extract_doc_id(sid: &str) -> &str {
    sid.split(':').next().unwrap_or(sid)
}

fn sentence_cache_key(
    doc_id: &str,
    sid: &str,
    source_hash: &str,
    provider_id: &str,
    model: &str,
    language: &str,
    prompt_version: &str,
) -> String {
    format!(
        "{doc_id}|{sid}|{source_hash}|{provider_id}|{model}|{language}|{prompt_version}"
    )
}

fn legacy_shared_sentence_cache_key(
    doc_id: &str,
    sid: &str,
    source_hash: &str,
    language: &str,
    prompt_version: &str,
) -> String {
    format!("{doc_id}|{sid}|{source_hash}|{language}|{prompt_version}")
}

fn find_cached_sentence_translation(
    cache: &CachedTranslations,
    doc_id: &str,
    sid: &str,
    source_hash: &str,
    provider_id: &str,
    model: &str,
    language: &str,
) -> Option<String> {
    let shared_key = sentence_cache_key(
        doc_id,
        sid,
        source_hash,
        provider_id,
        model,
        language,
        SENTENCE_PROMPT_VERSION,
    );
    if let Some(value) = cache.entries.get(&shared_key) {
        return Some(value.clone());
    }

    cache.entries
        .get(&legacy_shared_sentence_cache_key(
            doc_id,
            sid,
            source_hash,
            language,
            SENTENCE_PROMPT_VERSION,
        ))
        .cloned()
}

async fn request_sentence_translations_with_preset(
    handle: &tauri::AppHandle,
    preset: &TranslationPreset,
    temperature: f32,
    target_language: &TargetLanguage,
    sentences: &[TranslateSentence],
) -> Result<Vec<TranslationResult>, String> {
    if sentences.is_empty() {
        return Ok(Vec::new());
    }

    let provider = preset.to_provider_config();
    let system_prompt = build_system_prompt();
    let user_prompt = build_user_prompt(target_language, sentences);

    let mut content = request_chat_completion(
        &provider,
        &preset.model,
        temperature,
        &system_prompt,
        &user_prompt,
    )
    .await?;
    let mut parsed = parse_translation_json(&content);

    if parsed.is_err() {
        let strict_user_prompt = format!(
            "Return ONLY this JSON array format with no extra text. Target language: {} ({})\nInput JSON: {}",
            target_language.label,
            target_language.code,
            serde_json::to_string(sentences).unwrap_or_else(|_| "[]".to_string())
        );
        content = request_chat_completion(
            &provider,
            &preset.model,
            temperature,
            &system_prompt,
            &strict_user_prompt,
        )
        .await?;
        parsed = parse_translation_json(&content);
    }

    let translations = parsed.map_err(|e| format!("Failed to parse translation JSON: {}", e))?;
    let mut cache = load_cache(handle)?;

    for item in &translations {
        let source_text = sentences
            .iter()
            .find(|sentence| sentence.sid == item.sid)
            .map(|sentence| sentence.text.as_str())
            .unwrap_or("");
        let doc_id = extract_doc_id(&item.sid);
        let source_hash = hash_source_text(source_text);
        cache.entries.insert(
            sentence_cache_key(
                doc_id,
                &item.sid,
                &source_hash,
                &preset.id,
                &preset.model,
                &target_language.code,
                SENTENCE_PROMPT_VERSION,
            ),
            item.translation.clone(),
        );
    }

    if !translations.is_empty() {
        save_cache(handle, &cache).map_err(|error| {
            format!(
                "Translation succeeded, but readani could not save these results locally: {}",
                error
            )
        })?;
    }

    Ok(translations)
}

#[tauri::command(rename_all = "camelCase")]
async fn openrouter_translate(
    handle: tauri::AppHandle,
    preset_id: String,
    _model: String,
    temperature: f32,
    target_language: TargetLanguage,
    sentences: Vec<TranslateSentence>,
    force_fresh_ids: Option<Vec<String>>,
    request_id: Option<String>,
) -> Result<BatchTranslationResponse, String> {
    if sentences.is_empty() {
        return Ok(BatchTranslationResponse {
            results: Vec::new(),
            fallback_trace: TranslationFallbackTrace {
                requested_preset_id: preset_id.clone(),
                final_preset_id: preset_id,
                used_fallback: false,
                attempted_preset_ids: Vec::new(),
                attempt_count: 0,
                last_error: None,
            },
        });
    }

    let settings = load_app_settings(&handle)?;
    let presets = build_fallback_preset_sequence(&settings, &preset_id)?;
    let attempt_count = presets.len();
    let force_fresh_ids: HashSet<String> = force_fresh_ids.unwrap_or_default().into_iter().collect();
    let mut results: HashMap<String, String> = HashMap::new();
    let mut pending = sentences.clone();
    let mut attempted_preset_ids = Vec::with_capacity(attempt_count);
    let mut last_error: Option<String> = None;

    for (index, preset) in presets.iter().cloned().enumerate() {
        attempted_preset_ids.push(preset.id.clone());

        let cache = load_cache(&handle)?;
        let mut still_pending = Vec::new();
        for sentence in std::mem::take(&mut pending) {
            let doc_id = extract_doc_id(&sentence.sid);
            let source_hash = hash_source_text(&sentence.text);
            let is_force_fresh = force_fresh_ids.contains(&sentence.sid);

            if !is_force_fresh {
                if let Some(value) = find_cached_sentence_translation(
                    &cache,
                    doc_id,
                    &sentence.sid,
                    &source_hash,
                    &preset.id,
                    &preset.model,
                    &target_language.code,
                ) {
                    results.insert(sentence.sid.clone(), value);
                    continue;
                }
            }

            still_pending.push(sentence);
        }

        if still_pending.is_empty() {
            return Ok(BatchTranslationResponse {
                results: sentences
                    .iter()
                    .filter_map(|sentence| {
                        results.get(&sentence.sid).map(|translation| TranslationResult {
                            sid: sentence.sid.clone(),
                            translation: translation.clone(),
                        })
                    })
                    .collect(),
                fallback_trace: TranslationFallbackTrace {
                    requested_preset_id: preset_id.clone(),
                    final_preset_id: preset.id,
                    used_fallback: index > 0,
                    attempted_preset_ids,
                    attempt_count: index + 1,
                    last_error,
                },
            });
        }

        match request_sentence_translations_with_preset(
            &handle,
            &preset,
            temperature,
            &target_language,
            &still_pending,
        )
        .await
        {
            Ok(translations) => {
                for item in &translations {
                    results.insert(item.sid.clone(), item.translation.clone());
                }

                let unresolved: Vec<TranslateSentence> = still_pending
                    .into_iter()
                    .filter(|sentence| !results.contains_key(&sentence.sid))
                    .collect();

                if unresolved.is_empty() {
                    return Ok(BatchTranslationResponse {
                        results: sentences
                            .iter()
                            .filter_map(|sentence| {
                                results.get(&sentence.sid).map(|translation| TranslationResult {
                                    sid: sentence.sid.clone(),
                                    translation: translation.clone(),
                                })
                            })
                            .collect(),
                        fallback_trace: TranslationFallbackTrace {
                            requested_preset_id: preset_id.clone(),
                            final_preset_id: preset.id,
                            used_fallback: index > 0,
                            attempted_preset_ids,
                            attempt_count: index + 1,
                            last_error,
                        },
                    });
                }

                let error = format!("{} returned incomplete translations.", preset.label);
                let has_next = index + 1 < presets.len();
                last_error = Some(error.clone());
                if has_next && should_retry_with_fallback(&error) {
                    emit_fallback_progress(
                        &handle,
                        request_id.as_deref(),
                        &preset,
                        &presets[index + 1],
                        &error,
                        index + 1,
                        attempt_count,
                    );
                    pending = unresolved;
                    continue;
                }

                let trace = TranslationFallbackTrace {
                    requested_preset_id: preset_id.clone(),
                    final_preset_id: preset.id,
                    used_fallback: index > 0,
                    attempted_preset_ids,
                    attempt_count: index + 1,
                    last_error: Some(error.clone()),
                };
                emit_fallback_failure(&handle, request_id.as_deref(), &trace);
                return Err(error);
            }
            Err(error) => {
                let has_next = index + 1 < presets.len();
                last_error = Some(error.clone());
                if has_next && should_retry_with_fallback(&error) {
                    emit_fallback_progress(
                        &handle,
                        request_id.as_deref(),
                        &preset,
                        &presets[index + 1],
                        &error,
                        index + 1,
                        attempt_count,
                    );
                    pending = still_pending;
                    continue;
                }

                let trace = TranslationFallbackTrace {
                    requested_preset_id: preset_id.clone(),
                    final_preset_id: preset.id,
                    used_fallback: index > 0,
                    attempted_preset_ids,
                    attempt_count: index + 1,
                    last_error: Some(error.clone()),
                };
                emit_fallback_failure(&handle, request_id.as_deref(), &trace);
                return Err(error);
            }
        }
    }

    let error = last_error.unwrap_or_else(|| "Translation failed.".to_string());
    let trace = TranslationFallbackTrace {
        requested_preset_id: preset_id.clone(),
        final_preset_id: preset_id.clone(),
        used_fallback: false,
        attempted_preset_ids,
        attempt_count: 0,
        last_error: Some(error.clone()),
    };
    emit_fallback_failure(&handle, request_id.as_deref(), &trace);
    Err(error)
}

#[tauri::command(rename_all = "camelCase")]
async fn openrouter_word_lookup(
    handle: tauri::AppHandle,
    preset_id: String,
    _model: String,
    target_language: TargetLanguage,
    word: String,
) -> Result<WordLookupResponse, String> {
    let (result, fallback_trace) = execute_with_preset_fallback(
        &handle,
        &preset_id,
        None,
        |preset| async {
            let provider = preset.to_provider_config();
            let system_prompt = build_word_lookup_system_prompt();
            let user_prompt = build_word_lookup_prompt(&word, &target_language);

            let content = request_chat_completion(
                &provider,
                &preset.model,
                0.0,
                &system_prompt,
                &user_prompt,
            )
            .await?;

            let json_content = extract_json_object(&content);

            serde_json::from_str::<WordLookupResult>(&json_content).map_err(|e| {
                format!(
                    "Failed to parse word lookup JSON: {} (content: {})",
                    e,
                    truncate_for_error(&json_content)
                )
            })
        },
    )
    .await?;

    Ok(WordLookupResponse {
        phonetic: result.phonetic,
        definitions: result.definitions,
        fallback_trace,
    })
}

#[tauri::command(rename_all = "camelCase")]
fn add_vocabulary_word(
    handle: tauri::AppHandle,
    word: String,
    phonetic: Option<String>,
    definitions: Vec<WordDefinitionResult>,
) -> Result<(), String> {
    let mut vocab = load_vocabulary(&handle)?;

    // Check if word already exists (case-insensitive)
    let word_lower = word.to_lowercase();
    if vocab
        .entries
        .iter()
        .any(|e| e.word.to_lowercase() == word_lower)
    {
        return Ok(()); // Already exists, don't add duplicate
    }

    vocab.entries.push(VocabularyEntry {
        word,
        phonetic,
        definitions,
        added_at: Utc::now(),
    });

    save_vocabulary(&handle, &vocab)
}

#[tauri::command(rename_all = "camelCase")]
fn remove_vocabulary_word(handle: tauri::AppHandle, word: String) -> Result<(), String> {
    let mut vocab = load_vocabulary(&handle)?;
    let word_lower = word.to_lowercase();
    vocab
        .entries
        .retain(|e| e.word.to_lowercase() != word_lower);
    save_vocabulary(&handle, &vocab)
}

#[tauri::command(rename_all = "camelCase")]
fn get_vocabulary(handle: tauri::AppHandle) -> Result<Vec<VocabularyEntry>, String> {
    let vocab = load_vocabulary(&handle)?;
    Ok(vocab.entries)
}

#[tauri::command(rename_all = "camelCase")]
fn is_word_in_vocabulary(handle: tauri::AppHandle, word: String) -> Result<bool, String> {
    let vocab = load_vocabulary(&handle)?;
    let word_lower = word.to_lowercase();
    Ok(vocab
        .entries
        .iter()
        .any(|e| e.word.to_lowercase() == word_lower))
}

#[tauri::command(rename_all = "camelCase")]
fn export_vocabulary_markdown(handle: tauri::AppHandle) -> Result<String, String> {
    let vocab = load_vocabulary(&handle)?;

    let mut markdown = String::from("# My Vocabulary\n\n");
    markdown.push_str(&format!("Total words: {}\n\n", vocab.entries.len()));
    markdown.push_str("---\n\n");

    for entry in vocab.entries {
        markdown.push_str(&format!("## {}\n\n", entry.word));

        if let Some(phonetic) = &entry.phonetic {
            markdown.push_str(&format!("**Pronunciation:** {}\n\n", phonetic));
        }

        for def in &entry.definitions {
            if def.pos.is_empty() {
                markdown.push_str(&format!("- {}\n", def.meanings));
            } else {
                markdown.push_str(&format!("- **{}** {}\n", def.pos, def.meanings));
            }
        }

        markdown.push_str(&format!(
            "\n*Added: {}*\n\n",
            entry.added_at.format("%Y-%m-%d %H:%M")
        ));
        markdown.push_str("---\n\n");
    }

    Ok(markdown)
}

// Recent books management
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RecentBook {
    id: String,
    file_path: String,
    file_name: String,
    file_type: String,
    title: String,
    author: Option<String>,
    cover_image: Option<String>,
    total_pages: u32,
    last_page: u32,
    progress: f32,
    last_opened_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct RecentBooksData {
    books: Vec<RecentBook>,
}

fn recent_books_file_path(handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(handle)?.join("recent_books.json"))
}

fn load_recent_books(handle: &tauri::AppHandle) -> Result<RecentBooksData, String> {
    let path = recent_books_file_path(handle)?;
    if !path.exists() {
        return Ok(RecentBooksData { books: Vec::new() });
    }
    let data = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}

fn save_recent_books(handle: &tauri::AppHandle, data: &RecentBooksData) -> Result<(), String> {
    let path = recent_books_file_path(handle)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command(rename_all = "camelCase")]
fn get_recent_books(handle: tauri::AppHandle) -> Result<Vec<RecentBook>, String> {
    let data = load_recent_books(&handle)?;
    let mut books = data.books;
    books.sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
    Ok(books.into_iter().take(50).collect())
}

#[tauri::command(rename_all = "camelCase")]
fn add_recent_book(
    handle: tauri::AppHandle,
    id: String,
    file_path: String,
    file_name: String,
    file_type: String,
    title: String,
    author: Option<String>,
    cover_image: Option<String>,
    total_pages: u32,
) -> Result<(), String> {
    let mut data = load_recent_books(&handle)?;

    // Remove existing entry with same id OR same file_path (to prevent duplicates)
    data.books
        .retain(|b| b.id != id && b.file_path != file_path);

    // Add new entry
    data.books.push(RecentBook {
        id,
        file_path,
        file_name,
        file_type,
        title,
        author,
        cover_image,
        total_pages,
        last_page: 1,
        progress: 0.0,
        last_opened_at: Utc::now(),
    });

    // Keep only last 50 books
    data.books
        .sort_by(|a, b| b.last_opened_at.cmp(&a.last_opened_at));
    data.books.truncate(50);

    save_recent_books(&handle, &data)
}

#[tauri::command(rename_all = "camelCase")]
fn update_book_progress(
    handle: tauri::AppHandle,
    id: String,
    last_page: u32,
    progress: f32,
) -> Result<(), String> {
    let mut data = load_recent_books(&handle)?;

    if let Some(book) = data.books.iter_mut().find(|b| b.id == id) {
        book.last_page = last_page;
        book.progress = progress;
        book.last_opened_at = Utc::now();
    }

    save_recent_books(&handle, &data)
}

#[tauri::command(rename_all = "camelCase")]
fn remove_recent_book(handle: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut data = load_recent_books(&handle)?;
    data.books.retain(|b| b.id != id);
    save_recent_books(&handle, &data)
}

// Chat with context command
#[tauri::command(rename_all = "camelCase")]
async fn chat_with_context(
    handle: tauri::AppHandle,
    model: String,
    context: String,
    question: String,
) -> Result<String, String> {
    let provider = resolve_preset(&handle, None)?.to_provider_config();

    let system_prompt = "You are a helpful reading assistant. Answer questions about the provided text context clearly and concisely. If the answer cannot be found in the context, say so.";

    let user_prompt = format!(
        "Context from the document:\n\n{}\n\n---\n\nQuestion: {}",
        context, question
    );

    let content =
        request_chat_completion(&provider, &model, 0.3, system_prompt, &user_prompt).await?;
    Ok(content)
}

fn extract_json_object(content: &str) -> String {
    let trimmed = content.trim();

    // If it starts with {, it's already JSON
    if trimmed.starts_with('{') {
        return trimmed.to_string();
    }

    // Try to extract from markdown code block
    if let Some(start) = trimmed.find("```json") {
        if let Some(end) = trimmed[start..]
            .find("```\n")
            .or_else(|| trimmed[start..].rfind("```"))
        {
            let json_start = start + 7;
            let json_end = start + end;
            if json_start < json_end {
                return trimmed[json_start..json_end].trim().to_string();
            }
        }
    }

    // Try to find JSON object in the content
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if start < end {
                return trimmed[start..=end].to_string();
            }
        }
    }

    trimmed.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .setup(|app| {
            if let Err(error) = migrate_legacy_app_config(&app.handle()) {
                return Err(std::io::Error::other(error).into());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_pdf_file,
            get_app_settings,
            save_app_settings,
            get_translation_providers,
            save_translation_providers,
            list_provider_models,
            list_preset_models,
            translate_page_text,
            get_cached_page_translation,
            list_cached_page_translations,
            clear_cached_page_translation,
            clear_document_page_translations,
            translate_selection_text,
            openrouter_translate,
            openrouter_word_lookup,
            test_translation_preset,
            test_all_translation_presets,
            save_openrouter_key,
            get_openrouter_key_info,
            test_openrouter_key,
            add_vocabulary_word,
            remove_vocabulary_word,
            get_vocabulary,
            is_word_in_vocabulary,
            export_vocabulary_markdown,
            get_recent_books,
            add_recent_book,
            update_book_progress,
            remove_recent_book,
            chat_with_context
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        build_preset_test_prompt, build_selection_translation_prompt,
        find_cached_sentence_translation, merge_saved_preset_credentials, sentence_cache_key,
        CachedTranslations, TargetLanguage, PRESET_TEST_SAMPLE_TEXT, SENTENCE_PROMPT_VERSION,
    };
    use crate::app_settings::TranslationPreset;
    use crate::providers::ProviderKind;
    use std::collections::HashMap;

    #[test]
    fn custom_language_prompt_prefers_the_custom_label() {
        let prompt = build_selection_translation_prompt(
            &TargetLanguage {
                label: "Hong Kong Traditional Chinese".to_string(),
                code: "custom:hong-kong-traditional-chinese".to_string(),
            },
            "hello",
        );

        assert!(prompt.contains("Hong Kong Traditional Chinese"));
        assert!(!prompt.contains("custom:hong-kong-traditional-chinese"));
    }

    #[test]
    fn preset_test_prompt_uses_a_short_translation_sample() {
        let prompt = build_preset_test_prompt(&TargetLanguage {
            label: "Chinese (Simplified)".to_string(),
            code: "zh-CN".to_string(),
        });

        assert!(prompt.contains("Target language: Chinese (Simplified) (zh-CN)"));
        assert!(prompt.contains(PRESET_TEST_SAMPLE_TEXT));
    }

    #[test]
    fn merges_saved_api_key_back_into_sanitized_preset_for_testing() {
        let saved = TranslationPreset {
            id: "preset-1".to_string(),
            label: "OpenRouter".to_string(),
            provider_kind: ProviderKind::OpenRouter,
            base_url: None,
            api_key: Some("sk-saved".to_string()),
            api_key_configured: true,
            model: "openai/gpt-4o-mini".to_string(),
        };
        let incoming = TranslationPreset {
            id: "preset-1".to_string(),
            label: "OpenRouter".to_string(),
            provider_kind: ProviderKind::OpenRouter,
            base_url: None,
            api_key: None,
            api_key_configured: true,
            model: "openai/gpt-4o-mini".to_string(),
        };

        let merged = merge_saved_preset_credentials(&[saved], incoming);

        assert_eq!(merged.api_key.as_deref(), Some("sk-saved"));
        assert!(merged.api_key_configured);
    }

    #[test]
    fn does_not_merge_saved_api_keys_into_ollama_presets() {
        let saved = TranslationPreset {
            id: "preset-1".to_string(),
            label: "Ollama".to_string(),
            provider_kind: ProviderKind::Ollama,
            base_url: Some("http://localhost:11434/v1".to_string()),
            api_key: Some("old-key".to_string()),
            api_key_configured: true,
            model: "llama3.2".to_string(),
        };
        let incoming = TranslationPreset {
            id: "preset-1".to_string(),
            label: "Ollama".to_string(),
            provider_kind: ProviderKind::Ollama,
            base_url: Some("http://localhost:11434/v1".to_string()),
            api_key: None,
            api_key_configured: false,
            model: "llama3.2".to_string(),
        };

        let merged = merge_saved_preset_credentials(&[saved], incoming);

        assert_eq!(merged.api_key, None);
        assert!(!merged.api_key_configured);
    }

    #[test]
    fn sentence_cache_key_is_provider_independent() {
        let key = sentence_cache_key(
            "doc-1",
            "doc-1:1",
            "hash-1",
            "zh-CN",
            SENTENCE_PROMPT_VERSION,
        );

        assert_eq!(key, "doc-1|doc-1:1|hash-1|zh-CN|sentence-v1".to_string());
    }

    #[test]
    fn finds_legacy_sentence_cache_entries_across_provider_changes() {
        let mut entries = HashMap::new();
        entries.insert(
            "doc-1|doc-1:1|hash-1|preset-a|model-a|zh-CN".to_string(),
            "legacy translation".to_string(),
        );
        let cache = CachedTranslations { entries };

        let value = find_cached_sentence_translation(&cache, "doc-1", "doc-1:1", "hash-1", "zh-CN");

        assert_eq!(value.as_deref(), Some("legacy translation"));
    }
}
