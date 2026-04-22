import type {
  PresetSaveStatus,
  TargetLanguage,
  ThemeMode,
  TranslationPreset,
  TranslationProviderKind,
  TranslationSettings,
} from "../types";
import {
  DEFAULT_LANGUAGE,
  getLanguageLabel,
} from "./languageOptions";

export {
  buildCustomLanguage,
  buildLanguagePickerSections,
  COMMON_LANGUAGE_PRESETS,
  DEFAULT_LANGUAGE,
  getCustomLanguageOption,
  isCustomLanguage,
  LANGUAGE_PRESETS,
} from "./languageOptions";

export const DEFAULT_THEME: ThemeMode = "system";

export const PRESET_PROVIDER_OPTIONS: Array<{
  value: TranslationProviderKind;
  label: string;
}> = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
  { value: "openai-compatible", label: "OpenAI-Compatible" },
];

export const SAVED_API_KEY_MASK = "**************";

const PROVIDER_LABELS: Record<TranslationProviderKind, string> = {
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  "openai-compatible": "Custom",
};

const DEFAULT_MODELS: Record<TranslationProviderKind, string> = {
  openrouter: "openrouter/free",
  deepseek: "deepseek-chat",
  ollama: "llama3.2",
  "openai-compatible": "gpt-4o-mini",
};

const DEFAULT_BASE_URLS: Partial<Record<TranslationProviderKind, string>> = {
  deepseek: "https://api.deepseek.com",
  ollama: "http://localhost:11434/v1",
};

type LanguageLike = {
  code?: string;
  label?: string;
};

type PresetLike = {
  id: string;
};

type AppSettingsLike<TPreset extends PresetLike> = {
  activePresetId?: string;
  presets: TPreset[];
};

const LEGACY_PROVIDER_KIND_BY_CANONICAL: Record<TranslationProviderKind, string> = {
  openrouter: "open-router",
  deepseek: "deep-seek",
  ollama: "ollama",
  "openai-compatible": "open-ai-compatible",
};

const CANONICAL_PROVIDER_KIND_BY_VARIANT: Record<string, TranslationProviderKind> = {
  openrouter: "openrouter",
  "open-router": "openrouter",
  deepseek: "deepseek",
  "deep-seek": "deepseek",
  ollama: "ollama",
  "openai-compatible": "openai-compatible",
  "open-ai-compatible": "openai-compatible",
};

const PROVIDERS_WITH_API_KEYS = new Set<TranslationProviderKind>([
  "openrouter",
  "deepseek",
  "openai-compatible",
]);

const PROVIDERS_WITH_EDITABLE_BASE_URLS = new Set<TranslationProviderKind>([
  "ollama",
  "openai-compatible",
]);

export function normalizeProviderKind(
  providerKind?: TranslationProviderKind | string
): TranslationProviderKind {
  if (!providerKind) {
    return "openai-compatible";
  }

  return CANONICAL_PROVIDER_KIND_BY_VARIANT[providerKind] ?? "openai-compatible";
}

export function serializeProviderKindForCommand(
  providerKind: TranslationProviderKind
) {
  return LEGACY_PROVIDER_KIND_BY_CANONICAL[normalizeProviderKind(providerKind)];
}

export function normalizePresetFromStorage(preset: TranslationPreset): TranslationPreset {
  return {
    ...preset,
    providerKind: normalizeProviderKind(preset.providerKind),
  };
}

export function normalizeSettingsFromStorage(
  settings: TranslationSettings
): TranslationSettings {
  return {
    ...settings,
    autoFallbackEnabled: Boolean(settings.autoFallbackEnabled),
    translateAllSlowMode: Boolean(settings.translateAllSlowMode),
    presets: settings.presets.map(normalizePresetFromStorage),
  };
}

export function serializePresetForCommand(preset: TranslationPreset) {
  return {
    ...preset,
    providerKind: serializeProviderKindForCommand(preset.providerKind),
  };
}

export function serializeSettingsForCommand(settings: TranslationSettings) {
  return {
    ...settings,
    presets: settings.presets.map(serializePresetForCommand),
  };
}

export function buildPresetLabel(
  providerKind: TranslationProviderKind | string,
  model: string
) {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  const providerLabel =
    PROVIDER_LABELS[normalizedProviderKind] ?? "Provider";
  const trimmedModel = model.trim();

  if (!trimmedModel) {
    return providerLabel;
  }

  return `${providerLabel} · ${trimmedModel}`;
}

export function dedupePresetLabel(label: string, existingLabels: string[]) {
  if (!existingLabels.includes(label)) {
    return label;
  }

  let suffix = 2;
  let candidate = `${label} (${suffix})`;

  while (existingLabels.includes(candidate)) {
    suffix += 1;
    candidate = `${label} (${suffix})`;
  }

  return candidate;
}

export function getActivePreset<TPreset extends PresetLike>(
  settings: AppSettingsLike<TPreset>
) {
  if (settings.presets.length === 0) {
    return undefined;
  }

  return (
    settings.presets.find((preset) => preset.id === settings.activePresetId) ??
    settings.presets[0]
  );
}

export function normalizeDefaultLanguage(language?: LanguageLike): TargetLanguage {
  const code = language?.code?.trim() || DEFAULT_LANGUAGE.code;
  const fallbackLabel = getLanguageLabel(code) ?? code;
  const label = language?.label?.trim() || fallbackLabel;

  return {
    code,
    label,
  };
}

export function getNextThemeMode(theme: ThemeMode): ThemeMode {
  if (theme === "system") {
    return "light";
  }

  if (theme === "light") {
    return "dark";
  }

  return "system";
}

export function getDefaultModelForProvider(providerKind: TranslationProviderKind) {
  return DEFAULT_MODELS[normalizeProviderKind(providerKind)];
}

export function getDefaultBaseUrlForProvider(
  providerKind: TranslationProviderKind
) {
  return DEFAULT_BASE_URLS[normalizeProviderKind(providerKind)];
}

export function providerUsesApiKey(providerKind: TranslationProviderKind | string) {
  return PROVIDERS_WITH_API_KEYS.has(normalizeProviderKind(providerKind));
}

export function providerUsesEditableBaseUrl(
  providerKind: TranslationProviderKind | string
) {
  return PROVIDERS_WITH_EDITABLE_BASE_URLS.has(
    normalizeProviderKind(providerKind)
  );
}

export function getProviderOptionLabel(providerKind: TranslationProviderKind) {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  return (
    PRESET_PROVIDER_OPTIONS.find((provider) => provider.value === normalizedProviderKind)?.label ??
    "Provider"
  );
}

export function getPresetValidationState(
  preset: TranslationPreset,
  apiKeyInput: string
) {
  const normalizedProviderKind = normalizeProviderKind(preset.providerKind);
  const provider = Boolean(normalizedProviderKind);
  const model = Boolean(preset.model.trim());
  const baseUrl =
    !providerUsesEditableBaseUrl(normalizedProviderKind) ||
    Boolean(preset.baseUrl?.trim());
  const apiKey =
    !providerUsesApiKey(normalizedProviderKind) ||
    Boolean(apiKeyInput.trim() || preset.apiKeyConfigured);

  return {
    provider,
    model,
    baseUrl,
    apiKey,
    isValid: provider && model && baseUrl && apiKey,
  };
}

export function canPersistPresetDraft(
  preset: TranslationPreset,
  apiKeyInput: string
) {
  const validation = getPresetValidationState(preset, apiKeyInput);
  return validation.provider && validation.baseUrl && validation.apiKey;
}

export function getPresetMissingRequirement(
  preset: TranslationPreset,
  apiKeyInput: string
) {
  const validation = getPresetValidationState(preset, apiKeyInput);

  if (!validation.apiKey) {
    return "Add API key";
  }

  if (!validation.baseUrl) {
    return "Add Base URL";
  }

  if (!validation.model) {
    return "Add model";
  }

  return undefined;
}

export function getPresetSaveStatus(
  preset: TranslationPreset,
  apiKeyInput: string
): PresetSaveStatus {
  const validation = getPresetValidationState(preset, apiKeyInput);
  const detail = getPresetMissingRequirement(preset, apiKeyInput);

  if (validation.isValid) {
    return { state: "saved" };
  }

  return {
    state: "invalid",
    detail,
  };
}

export function hasPresetTranslationContext(
  preset?: TranslationPreset
) {
  return Boolean(preset?.id.trim() && preset.model.trim());
}

export function hasUsableLiveTranslationSetup(
  preset?: TranslationPreset
) {
  if (!preset) {
    return false;
  }

  return getPresetValidationState(preset, "").isValid;
}

export function getPresetApiKeyFieldState({
  apiKeyConfigured,
  apiKeyInput,
  isEditing,
}: {
  apiKeyConfigured?: boolean;
  apiKeyInput: string;
  isEditing: boolean;
}) {
  const hasDraft = Boolean(apiKeyInput.trim());
  const showsSavedMask = Boolean(apiKeyConfigured && !hasDraft && !isEditing);

  return {
    displayValue: hasDraft ? apiKeyInput : "",
    placeholder: showsSavedMask ? SAVED_API_KEY_MASK : "e.g. sk-...",
    showsSavedMask,
  };
}

export function isPresetUnchangedFromSavedState({
  preset,
  savedPreset,
  apiKeyInput,
}: {
  preset?: TranslationPreset;
  savedPreset?: TranslationPreset;
  apiKeyInput: string;
}) {
  if (!preset || !savedPreset) {
    return false;
  }

  if (apiKeyInput.trim()) {
    return false;
  }

  return (
    preset.label === savedPreset.label &&
    normalizeProviderKind(preset.providerKind) ===
      normalizeProviderKind(savedPreset.providerKind) &&
    preset.model.trim() === savedPreset.model.trim() &&
    (preset.baseUrl?.trim() ?? "") === (savedPreset.baseUrl?.trim() ?? "") &&
    Boolean(preset.apiKeyConfigured) === Boolean(savedPreset.apiKeyConfigured)
  );
}

export function discardUnsavedPresetEdits({
  settings,
  savedSettings,
  presetId,
}: {
  settings: TranslationSettings;
  savedSettings: TranslationSettings;
  presetId: string;
}) {
  const savedPreset = savedSettings.presets.find((preset) => preset.id === presetId);

  if (savedPreset) {
    return {
      ...settings,
      presets: settings.presets.map((preset) =>
        preset.id === presetId ? normalizePresetFromStorage(savedPreset) : preset
      ),
    };
  }

  const nextPresets = settings.presets.filter((preset) => preset.id !== presetId);
  const nextActivePresetId = nextPresets.some(
    (preset) => preset.id === settings.activePresetId
  )
    ? settings.activePresetId
    : nextPresets.some((preset) => preset.id === savedSettings.activePresetId)
      ? savedSettings.activePresetId
      : (nextPresets[0]?.id ?? "");

  return {
    ...settings,
    activePresetId: nextActivePresetId,
    presets: nextPresets,
  };
}

export function normalizePresetDraft(
  preset: TranslationPreset,
  presets: TranslationPreset[]
): TranslationPreset {
  const providerKind = normalizeProviderKind(preset.providerKind);
  const normalizedModel = preset.model.trim();
  const nextLabel = buildPresetLabel(providerKind, normalizedModel);
  const otherLabels = presets
    .filter((candidate) => candidate.id !== preset.id)
    .map((candidate) => candidate.label);

  return {
    ...preset,
    providerKind,
    label: dedupePresetLabel(nextLabel, otherLabels),
    model: normalizedModel,
    baseUrl: (() => {
      if (providerKind === "openrouter") {
        return undefined;
      }

      if (providerKind === "deepseek") {
        return DEFAULT_BASE_URLS[providerKind];
      }

      return preset.baseUrl?.trim() || DEFAULT_BASE_URLS[providerKind];
    })(),
  };
}

export function createPresetDraft(
  providerKind: TranslationProviderKind,
  presets: TranslationPreset[]
): TranslationPreset {
  const preset = normalizePresetDraft(
    {
      id: createPresetId(),
      label: "",
      providerKind,
      baseUrl: DEFAULT_BASE_URLS[providerKind],
      model: "",
    },
    presets
  );

  return preset;
}

export function createDefaultSettings(): TranslationSettings {
  return {
    activePresetId: "",
    autoFallbackEnabled: false,
    translateAllSlowMode: false,
    defaultLanguage: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    presets: [],
  };
}

function createPresetId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
