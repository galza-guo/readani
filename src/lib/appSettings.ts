import type {
  PresetSaveStatus,
  ProviderReasoningMode,
  TargetLanguage,
  ThemeMode,
  TranslationPreset,
  TranslationProviderKind,
  TranslationSettings,
} from "../types";
import { hasLocaleMessage, t } from "./i18n";
import {
  DEFAULT_LANGUAGE,
  buildAppLanguageTarget,
  buildFollowSystemLanguage,
  getLanguageLabel,
  isAppLanguageTarget,
  isFollowSystemLanguage,
  isSupportedAppUiLanguageCode,
  resolveLanguageFromLocale,
} from "./languageOptions";

export {
  buildCustomLanguage,
  buildAppLanguagePickerSections,
  buildAppLanguageTarget,
  buildLanguagePickerSections,
  buildFollowSystemLanguage,
  buildTranslateToLanguagePickerSections,
  COMMON_LANGUAGE_PRESETS,
  DEFAULT_LANGUAGE,
  getCustomLanguageOption,
  isCustomLanguage,
  isAppLanguageTarget,
  isFollowSystemLanguage,
  LANGUAGE_PRESETS,
  resolveLanguageFromLocale,
} from "./languageOptions";

export const DEFAULT_THEME: ThemeMode = "system";
export const DEFAULT_AUTO_TRANSLATE_NEXT_PAGES = 1;
export const MAX_AUTO_TRANSLATE_NEXT_PAGES = 20;

export const PRESET_PROVIDER_OPTIONS: Array<{
  value: TranslationProviderKind;
  label: string;
}> = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "ollama", label: "Ollama" },
  { value: "openai", label: "OpenAI" },
  { value: "google-gemini", label: "Google Gemini" },
  { value: "siliconflow-cn", label: "SiliconFlow.cn" },
  { value: "siliconflow-com", label: "SiliconFlow.com" },
  { value: "dashscope", label: "DashScope" },
  { value: "modelscope", label: "ModelScope" },
  { value: "minimax-io", label: "MiniMax.io" },
  { value: "minimaxi", label: "MiniMaxi.com" },
  { value: "zai", label: "Z.ai" },
  { value: "bigmodel", label: "BigModel" },
  { value: "openai-compatible", label: "Custom" },
];

export const SAVED_API_KEY_MASK = "**************";

const PROVIDER_LABELS: Record<TranslationProviderKind, string> = {
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
  ollama: "Ollama",
  "openai-compatible": "Custom",
  openai: "OpenAI",
  "google-gemini": "Gemini",
  "siliconflow-cn": "SiliconFlow.cn",
  "siliconflow-com": "SiliconFlow.com",
  dashscope: "DashScope",
  modelscope: "ModelScope",
  "minimax-io": "MiniMax.io",
  minimaxi: "MiniMaxi.com",
  zai: "Z.ai",
  bigmodel: "BigModel",
};

const DEFAULT_MODELS: Record<TranslationProviderKind, string> = {
  openrouter: "openrouter/free",
  deepseek: "deepseek-chat",
  ollama: "llama3.2",
  "openai-compatible": "gpt-4o-mini",
  openai: "gpt-5.4-mini",
  "google-gemini": "gemini-2.5-flash",
  "siliconflow-cn": "Qwen/Qwen3-235B-A22B",
  "siliconflow-com": "Qwen/Qwen3-235B-A22B",
  dashscope: "qwen-plus",
  modelscope: "Qwen/Qwen3-30B-A3B",
  "minimax-io": "MiniMax-M2.7",
  minimaxi: "MiniMax-M2.7",
  zai: "glm-5.1",
  bigmodel: "glm-5.1",
};

const DEFAULT_BASE_URLS: Partial<Record<TranslationProviderKind, string>> = {
  deepseek: "https://api.deepseek.com",
  ollama: "http://localhost:11434/v1",
  openai: "https://api.openai.com/v1",
  "google-gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
  "siliconflow-cn": "https://api.siliconflow.cn/v1",
  "siliconflow-com": "https://api.siliconflow.com/v1",
  dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  modelscope: "https://api-inference.modelscope.cn/v1",
  "minimax-io": "https://api.minimax.io/v1",
  minimaxi: "https://api.minimaxi.com/v1",
  zai: "https://api.z.ai/api/paas/v4",
  bigmodel: "https://open.bigmodel.cn/api/paas/v4",
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
  openai: "openai",
  "google-gemini": "google-gemini",
  "siliconflow-cn": "siliconflow-cn",
  "siliconflow-com": "siliconflow-com",
  dashscope: "dashscope",
  modelscope: "modelscope",
  "minimax-io": "minimax-io",
  minimaxi: "minimaxi",
  zai: "zai",
  bigmodel: "bigmodel",
};

const CANONICAL_PROVIDER_KIND_BY_VARIANT: Record<string, TranslationProviderKind> = {
  openrouter: "openrouter",
  "open-router": "openrouter",
  deepseek: "deepseek",
  "deep-seek": "deepseek",
  ollama: "ollama",
  "openai-compatible": "openai-compatible",
  "open-ai-compatible": "openai-compatible",
  openai: "openai",
  "google-gemini": "google-gemini",
  "siliconflow-cn": "siliconflow-cn",
  "siliconflow-com": "siliconflow-com",
  dashscope: "dashscope",
  modelscope: "modelscope",
  "minimax-io": "minimax-io",
  minimaxi: "minimaxi",
  zai: "zai",
  bigmodel: "bigmodel",
};

const PROVIDERS_WITH_API_KEYS = new Set<TranslationProviderKind>([
  "openrouter",
  "deepseek",
  "openai-compatible",
  "openai",
  "google-gemini",
  "siliconflow-cn",
  "siliconflow-com",
  "dashscope",
  "modelscope",
  "minimax-io",
  "minimaxi",
  "zai",
  "bigmodel",
]);

const PROVIDERS_WITH_EDITABLE_BASE_URLS = new Set<TranslationProviderKind>([
  "ollama",
  "openai-compatible",
]);

const CODING_PLAN_BASE_URLS: Partial<Record<TranslationProviderKind, string>> = {
  zai: "https://api.z.ai/api/coding/paas/v4",
  bigmodel: "https://open.bigmodel.cn/api/coding/paas/v4",
};

const CODING_PLAN_KEY_PREFIXES: Partial<Record<TranslationProviderKind, string>> = {
  "minimax-io": "sk-cp-",
  minimaxi: "sk-cp-",
};

const DEEPSEEK_THINKING_MODES = new Set<ProviderReasoningMode>([
  "off",
  "high",
  "max",
]);

const STANDARD_REASONING_MODES = new Set<ProviderReasoningMode>([
  "off",
  "low",
  "medium",
  "high",
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
  const providerKind = normalizeProviderKind(preset.providerKind);
  const normalizedPreset: TranslationPreset = {
    ...preset,
    providerKind,
    codingPlan: Boolean(preset.codingPlan),
  };

  delete normalizedPreset.thinking;
  delete normalizedPreset.reasoning;

  if (
    providerKind === "deepseek"
    || providerKind === "siliconflow-cn"
    || providerKind === "siliconflow-com"
    || providerKind === "dashscope"
  ) {
    normalizedPreset.thinking = normalizeProviderReasoningMode(providerKind, preset.thinking);
  }

  if (
    providerKind === "openrouter"
    || providerKind === "ollama"
    || providerKind === "openai"
    || providerKind === "google-gemini"
    || providerKind === "minimax-io"
    || providerKind === "minimaxi"
    || providerKind === "zai"
    || providerKind === "bigmodel"
  ) {
    normalizedPreset.reasoning = normalizeProviderReasoningMode(providerKind, preset.reasoning);
  }

  return normalizedPreset;
}

export function normalizeSettingsFromStorage(
  settings: TranslationSettings,
  _systemLocale?: string | null,
): TranslationSettings {
  const normalizedAppLanguage = normalizeAppLanguage(
    (settings as Partial<TranslationSettings>).appLanguage
  );

  return {
    ...settings,
    autoFallbackEnabled: Boolean(settings.autoFallbackEnabled),
    autoTranslateNextPages: normalizeAutoTranslateNextPages(
      (settings as Partial<TranslationSettings>).autoTranslateNextPages
    ),
    appLanguage: normalizedAppLanguage,
    defaultLanguage: normalizeDefaultLanguage(settings.defaultLanguage),
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
  if (isAppLanguageTarget(language)) {
    return buildAppLanguageTarget();
  }

  return normalizeConcreteLanguage(language, DEFAULT_LANGUAGE);
}

export function normalizeAppLanguage(language?: LanguageLike): TargetLanguage {
  if (!language?.code || isFollowSystemLanguage(language)) {
    return buildFollowSystemLanguage();
  }

  if (!isSupportedAppUiLanguageCode(language.code)) {
    return buildFollowSystemLanguage();
  }

  return normalizeConcreteLanguage(language, buildFollowSystemLanguage());
}

export function resolveAppLanguage(
  appLanguage: LanguageLike | undefined,
  systemLocale?: string | null
) {
  const normalizedAppLanguage = normalizeAppLanguage(appLanguage);
  if (!isFollowSystemLanguage(normalizedAppLanguage)) {
    return normalizedAppLanguage;
  }

  return resolveLanguageFromLocale(systemLocale);
}

export function resolveTargetLanguage(
  targetLanguage: LanguageLike | undefined,
  appLanguage: LanguageLike | undefined,
  systemLocale?: string | null
) {
  const normalizedTargetLanguage = normalizeDefaultLanguage(targetLanguage);
  if (!isAppLanguageTarget(normalizedTargetLanguage)) {
    return normalizedTargetLanguage;
  }

  return resolveAppLanguage(appLanguage, systemLocale);
}

function normalizeConcreteLanguage(
  language: LanguageLike | undefined,
  fallbackLanguage: TargetLanguage
) {
  const code = language?.code?.trim() || fallbackLanguage.code;
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

export function normalizeAutoTranslateNextPages(value?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_AUTO_TRANSLATE_NEXT_PAGES;
  }

  return Math.min(
    MAX_AUTO_TRANSLATE_NEXT_PAGES,
    Math.max(0, Math.floor(value))
  );
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

export function providerUsesThinking(providerKind: TranslationProviderKind | string) {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  return normalizedProviderKind === "deepseek"
    || normalizedProviderKind === "siliconflow-cn"
    || normalizedProviderKind === "siliconflow-com"
    || normalizedProviderKind === "dashscope";
}

export function providerUsesReasoning(providerKind: TranslationProviderKind | string) {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  return normalizedProviderKind === "openrouter"
    || normalizedProviderKind === "ollama"
    || normalizedProviderKind === "openai"
    || normalizedProviderKind === "google-gemini"
    || normalizedProviderKind === "minimax-io"
    || normalizedProviderKind === "minimaxi"
    || normalizedProviderKind === "zai"
    || normalizedProviderKind === "bigmodel";
}

export function normalizeProviderReasoningMode(
  providerKind: TranslationProviderKind | string,
  value?: string
): ProviderReasoningMode {
  const normalizedProviderKind = normalizeProviderKind(providerKind);
  const normalizedValue = value as ProviderReasoningMode | undefined;

  // DeepSeek: thinking toggle (off/high/max)
  if (normalizedProviderKind === "deepseek") {
    return normalizedValue && DEEPSEEK_THINKING_MODES.has(normalizedValue)
      ? normalizedValue
      : "off";
  }

  // SiliconFlow, DashScope: boolean thinking (off/high only)
  if (normalizedProviderKind === "siliconflow-cn" || normalizedProviderKind === "siliconflow-com" || normalizedProviderKind === "dashscope") {
    return normalizedValue === "high" || normalizedValue === "max" ? "high" : "off";
  }

  // Standard reasoning: off/low/medium/high
  if (
    normalizedProviderKind === "openrouter"
    || normalizedProviderKind === "ollama"
    || normalizedProviderKind === "openai"
    || normalizedProviderKind === "google-gemini"
    || normalizedProviderKind === "minimax-io"
    || normalizedProviderKind === "minimaxi"
    || normalizedProviderKind === "zai"
    || normalizedProviderKind === "bigmodel"
  ) {
    return normalizedValue && STANDARD_REASONING_MODES.has(normalizedValue)
      ? normalizedValue
      : "off";
  }

  return "off";
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
}: {
  apiKeyConfigured?: boolean;
  apiKeyInput: string;
}) {
  const hasDraft = Boolean(apiKeyInput.trim());
  const showsSavedMask = Boolean(apiKeyConfigured && !hasDraft);

  return {
    displayValue: hasDraft ? apiKeyInput : "",
    placeholder:
      showsSavedMask && hasLocaleMessage("settings.apiKeySavedPlaceholder")
        ? t("settings.apiKeySavedPlaceholder")
        : "key",
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
    Boolean(preset.apiKeyConfigured) === Boolean(savedPreset.apiKeyConfigured) &&
    normalizeProviderReasoningMode(preset.providerKind, preset.thinking) ===
      normalizeProviderReasoningMode(savedPreset.providerKind, savedPreset.thinking) &&
    normalizeProviderReasoningMode(preset.providerKind, preset.reasoning) ===
      normalizeProviderReasoningMode(savedPreset.providerKind, savedPreset.reasoning)
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

  const normalizedPreset: TranslationPreset = {
    ...preset,
    providerKind,
    label: dedupePresetLabel(nextLabel, otherLabels),
    model: normalizedModel,
    codingPlan: Boolean(preset.codingPlan),
    baseUrl: (() => {
      if (providerKind === "openrouter") {
        return undefined;
      }

      const codingPlanUrl = preset.codingPlan ? CODING_PLAN_BASE_URLS[providerKind] : undefined;
      if (codingPlanUrl) {
        return codingPlanUrl;
      }

      const defaultUrl = DEFAULT_BASE_URLS[providerKind];

      if (
        providerKind === "deepseek"
        || providerKind === "openai"
        || providerKind === "google-gemini"
        || providerKind === "siliconflow-cn"
        || providerKind === "siliconflow-com"
        || providerKind === "dashscope"
        || providerKind === "modelscope"
        || providerKind === "minimax-io"
        || providerKind === "minimaxi"
        || providerKind === "zai"
        || providerKind === "bigmodel"
      ) {
        return defaultUrl;
      }

      return preset.baseUrl?.trim() || defaultUrl;
    })(),
  };

  delete normalizedPreset.thinking;
  delete normalizedPreset.reasoning;

  if (
    providerKind === "deepseek"
    || providerKind === "siliconflow-cn"
    || providerKind === "siliconflow-com"
    || providerKind === "dashscope"
  ) {
    normalizedPreset.thinking = normalizeProviderReasoningMode(providerKind, preset.thinking);
  }

  if (
    providerKind === "openrouter"
    || providerKind === "ollama"
    || providerKind === "openai"
    || providerKind === "google-gemini"
    || providerKind === "minimax-io"
    || providerKind === "minimaxi"
    || providerKind === "zai"
    || providerKind === "bigmodel"
  ) {
    normalizedPreset.reasoning = normalizeProviderReasoningMode(providerKind, preset.reasoning);
  }

  return normalizedPreset;
}

export function detectCodingPlanKey(
  providerKind: TranslationProviderKind | string,
  apiKey: string,
): boolean {
  const prefix = CODING_PLAN_KEY_PREFIXES[normalizeProviderKind(providerKind)];
  if (!prefix) {
    return false;
  }
  return apiKey.trim().startsWith(prefix);
}

export function providerUsesCodingPlan(
  providerKind: TranslationProviderKind | string,
): boolean {
  const normalized = normalizeProviderKind(providerKind);
  return normalized === "minimax-io"
    || normalized === "minimaxi"
    || normalized === "zai"
    || normalized === "bigmodel";
}

export function getCodingPlanBaseUrl(
  providerKind: TranslationProviderKind | string,
): string | undefined {
  return CODING_PLAN_BASE_URLS[normalizeProviderKind(providerKind)];
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
    autoTranslateNextPages: DEFAULT_AUTO_TRANSLATE_NEXT_PAGES,
    appLanguage: buildFollowSystemLanguage(),
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
